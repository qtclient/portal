import type { RequestHandler } from './$types';

/**
 * qtclient-fs Worker — the only code that touches the origin OPFS on /play.
 *
 * Two clients, one owner of every SyncAccessHandle:
 *  - wasm (qtclient browser/qtclient_opfs_backend.cpp, a WasmFS backend mounted
 *    at /home/web_user) over a request block that lives in the wasm heap;
 *  - portal install / stamp code (`$lib/client/qtclient-fs/bridge.ts`) over
 *    postMessage.
 *
 * Wasm requests come in two kinds:
 *  - sync: read / write / size / truncate on an open access handle and
 *    handle bookkeeping. Served inline — SyncAccessHandle I/O completes without
 *    the page's main thread, so the caller may block on it.
 *  - async: lookups, create, list, remove, move, open (FileSystemHandle
 *    promises). Safari only completes these while the page's main thread is
 *    free, so a main-thread caller suspends (JSPI) instead of blocking.
 *
 * Completion: a pthread caller is woken with Atomics.notify on its slot; the
 * wasm main thread with a `main-done` message (Safari runs a message task at
 * once, while an Atomics.waitAsync resolution can wait for unrelated work).
 *
 * Scheduling: the worker never blocks. It sleeps in its event loop on the
 * request bell with Atomics.waitAsync (pthread requests), and the wasm main
 * thread also posts a `ring` message per request (Safari only resolves a
 * waitAsync once some other task wakes the worker). Portal messages are always
 * delivered and a page unload terminates it at once —
 * a thread blocked in Atomics.wait keeps its OPFS locks past a reload (Chrome
 * ~2 s, Safari until the tab goes away).
 *
 * Memory model (like a native fs): bytes stay in OPFS. Reads and writes go
 * straight between the access handle and the wasm heap; nothing is cached.
 * Access handles (OS handles, no file contents) stay open in a small LRU after
 * their last close so reopen is cheap.
 *
 * Wire layout and errno values are published by the wasm side in `attach`
 * (Emscripten uses WASI errno numbers). PROTOCOL must match
 * qtclient_opfs_backend.cpp kProtocol.
 */
const headers: Record<string, string> = {
	'Content-Type': 'text/javascript; charset=utf-8',
	'Cache-Control': 'no-store',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
};

const WORKER_JS = String.raw`
'use strict';
var PROTOCOL = 5;
var MAIN_SLOT = 0;
// Every SyncAccessHandle is an OS file handle in the browser's storage
// process. Safari fails createSyncAccessHandle with "Invalid platform file
// handle" past ~250 open handles (measured), so the Worker caps them like a
// process fd limit: idle ones are closed first, and a new open waits for a
// release when all are in use.
var MAX_OPEN_HANDLES = 32;
// Of those, handles kept open after their last close (cheap reopen for wasm).
var IDLE_HANDLES_MAX = 16;
// A just-closed /play document's Worker releases its access handles
// asynchronously; wait that long for a lock before reporting a conflict.
var LOCK_WAIT_MS = 4000;

// Wasm op codes (qtclient_opfs_backend.cpp enum Op).
var OP = {
  CHILD: 1, INSERT_FILE: 2, INSERT_DIR: 3, REMOVE: 4, ENTRIES: 5, MOVE: 6,
  OPEN: 7, CLOSE: 8, READ: 9, WRITE: 10, SIZE_ACCESS: 11, TRUNC_ACCESS: 12,
  SIZE_FILE: 14, TRUNC_FILE: 15, FREE_NODE: 16,
};
var OP_NAME = {};
Object.keys(OP).forEach(function (k) { OP_NAME[OP[k]] = k; });
var SYNC_OPS = new Set([OP.CLOSE, OP.READ, OP.WRITE, OP.SIZE_ACCESS, OP.TRUNC_ACCESS, OP.FREE_NODE]);

var root = null;

// ---- wasm channel -----------------------------------------------------------
var memory = null;   // shared WebAssembly.Memory (may grow: launcher)
var L = null;        // byte offsets from attach
var ERR = null;      // errno values from attach
var I32 = null, F64 = null, U8 = null;

function views() {
  var buf = memory.buffer;
  if (U8 && U8.length === buf.byteLength) return;
  I32 = new Int32Array(buf);
  F64 = new Float64Array(buf);
  U8 = new Uint8Array(buf);
}
function slotState(s) { return (L.slots + s * L.stride + L.state) >> 2; }
function slotOp(s) { return (L.slots + s * L.stride + L.op) >> 2; }
function arg(s, i) { return F64[((L.slots + s * L.stride + L.args) >> 3) + i]; }
function readName(s, iPtr, iLen) {
  var p = arg(s, iPtr) >>> 0, n = arg(s, iLen) >>> 0;
  return new TextDecoder().decode(U8.slice(p, p + n));
}
function finish(s, r0, r1) {
  views();
  var base = L.slots + s * L.stride;
  F64[(base + L.r0) >> 3] = r0;
  F64[(base + L.r1) >> 3] = r1 || 0;
  Atomics.store(I32, slotState(s), 3);
  // Slot 0 is the wasm main thread: it waits for this message (a task, so
  // Safari runs it at once). Pthreads block in futex_wait on the state word.
  if (s === MAIN_SLOT) self.postMessage({ type: 'main-done' });
  else Atomics.notify(I32, slotState(s));
}

// ---- node / handle tables ---------------------------------------------------
/** id → { kind: 'file'|'dir', handle, path } ; path is OPFS-relative ('' = root). */
var nodes = new Map();
var nextNode = 2;
/** OPFS-relative path → { id, path, sah, refs } */
var accessByPath = new Map();
var accessById = new Map();
var nextAccess = 1;
/** paths whose access handle has refs == 0, least recently used first */
var idle = [];
/** path → Promise<access rec> while createSyncAccessHandle is in flight */
var opening = new Map();
/** OPFS-relative dir path → handle (portal path ops) */
var dirCache = new Map();

function join(dir, name) { return dir ? dir + '/' + name : name; }
function under(path, prefix) { return path === prefix || path.indexOf(prefix + '/') === 0; }
function node(id) {
  var n = nodes.get(id);
  if (!n) throw fsError('BADF', 'stale node ' + id);
  return n;
}
/** OPFS-relative path → live node count (WasmFS holds a File for it). */
var nodesAtPath = new Map();
function countPath(path, delta) {
  var n = (nodesAtPath.get(path) || 0) + delta;
  if (n > 0) nodesAtPath.set(path, n); else nodesAtPath.delete(path);
}
function addNode(kind, handle, path) {
  var id = nextNode++;
  nodes.set(id, { kind: kind, handle: handle, path: path });
  countPath(path, 1);
  return id;
}
function freeNode(id) {
  var n = nodes.get(id);
  if (!n) return;
  nodes.delete(id);
  countPath(n.path, -1);
}

function fsError(code, message) {
  var e = new Error(message || code);
  e.code = code;
  return e;
}
/** Our own fsError code (string); DOMException.code is a legacy number. */
function ownCode(e) {
  return e && typeof e.code === 'string' ? e.code : null;
}
function errnoOf(e) {
  var code = ownCode(e);
  if (!code) {
    switch (e && e.name) {
    case 'NotFoundError': code = 'NOENT'; break;
    case 'TypeMismatchError': code = 'NOTDIR'; break;
    case 'NoModificationAllowedError': code = 'BUSY'; break;
    case 'InvalidStateError': code = 'BUSY'; break;
    case 'InvalidModificationError': code = 'NOTEMPTY'; break;
    case 'QuotaExceededError': code = 'NOSPC'; break;
    case 'TypeError': code = 'INVAL'; break;
    default: code = 'IO';
    }
  }
  if (code === 'IO') log('unexpected OPFS error', e);
  if (!ERR) return -1;
  return -(ERR[code] || ERR.IO);
}
function log(what, e) {
  self.postMessage({ type: 'log', message: what + ': ' + (e && e.name ? e.name + ': ' + e.message : String(e)) });
}

function untouch(path) {
  var i = idle.indexOf(path);
  if (i >= 0) idle.splice(i, 1);
}
function closeRec(rec) {
  accessByPath.delete(rec.path);
  accessById.delete(rec.id);
  untouch(rec.path);
  // close() persists written data (no separate flush: see OpfsFile::flush).
  rec.sah.close();
  releaseHandle();
}

/** Access handles open or being opened; see MAX_OPEN_HANDLES. */
var handlesInUse = 0;
var handleWaiters = [];
function releaseHandle() {
  handlesInUse--;
  var w = handleWaiters.shift();
  if (w) w();
}
/**
 * Take one access-handle slot. The check and the increment run in the same
 * tick: concurrent callers must not all pass the check before any counts.
 */
async function reserveHandle() {
  for (;;) {
    while (handlesInUse >= MAX_OPEN_HANDLES && idle.length) {
      var rec = accessByPath.get(idle[0]);
      if (rec) closeRec(rec); else idle.shift();
    }
    if (handlesInUse < MAX_OPEN_HANDLES) {
      handlesInUse++;
      return;
    }
    await new Promise(function (r) { handleWaiters.push(r); });
  }
}
function evictIdle(max) {
  while (idle.length > max) {
    var rec = accessByPath.get(idle[0]);
    if (rec) closeRec(rec); else idle.shift();
  }
}
/** Close idle handles under path; EBUSY if one is open by a caller. */
function releaseHandlesUnder(path) {
  Array.from(accessByPath.values()).forEach(function (rec) {
    if (!under(rec.path, path)) return;
    if (rec.refs > 0) throw fsError('BUSY', rec.path + ' is open');
    closeRec(rec);
  });
}
function forgetDirs(path) {
  Array.from(dirCache.keys()).forEach(function (k) { if (under(k, path)) dirCache.delete(k); });
}
function renamePaths(from, to) {
  nodes.forEach(function (n) {
    if (!under(n.path, from)) return;
    countPath(n.path, -1);
    n.path = to + n.path.slice(from.length);
    countPath(n.path, 1);
  });
}

async function openAccess(path, fileHandle) {
  var rec = accessByPath.get(path);
  if (rec) {
    untouch(path);
    rec.refs++;
    return rec;
  }
  var pending = opening.get(path);
  if (!pending) {
    await reserveHandle();
    // Another caller may have opened or started opening it meanwhile.
    rec = accessByPath.get(path) || null;
    pending = opening.get(path);
    if (rec || pending) releaseHandle();
    if (rec) {
      untouch(path);
      rec.refs++;
      return rec;
    }
  }
  if (!pending) {
    pending = (async function () {
      var sah = await createAccessHandle(path, fileHandle);
      var r = { id: nextAccess++, path: path, sah: sah, refs: 0 };
      accessByPath.set(path, r);
      accessById.set(r.id, r);
      return r;
    })();
    opening.set(path, pending);
    pending.then(function () { opening.delete(path); }, function () {
      opening.delete(path);
      releaseHandle();
    });
  }
  rec = await pending;
  untouch(path);
  rec.refs++;
  return rec;
}
function isLockConflict(e) {
  return e && (e.name === 'NoModificationAllowedError' || e.name === 'InvalidStateError');
}
async function createAccessHandle(path, fileHandle) {
  var t0 = performance.now();
  for (var delay = 10;; delay = Math.min(delay * 2, 250)) {
    try {
      return await fileHandle.createSyncAccessHandle();
    } catch (e) {
      if (!isLockConflict(e)) throw e;
      if (performance.now() - t0 > LOCK_WAIT_MS) {
        throw fsError('BUSY', path + ' is locked by another /play tab or window (' + e.name + ')');
      }
    }
    await new Promise(function (r) { setTimeout(r, delay); });
  }
}
/** keepIdle: leave the handle open for a cheap reopen (wasm files). */
function closeAccess(rec, keepIdle) {
  if (--rec.refs > 0) return;
  if (!keepIdle) {
    closeRec(rec);
    return;
  }
  idle.push(rec.path);
  evictIdle(IDLE_HANDLES_MAX);
}
function accessOf(id) {
  var rec = accessById.get(id);
  if (!rec) throw fsError('BADF', 'access ' + id);
  return rec;
}

async function dirByPath(rel, create) {
  if (!rel) return root;
  var hit = dirCache.get(rel);
  if (hit) return hit;
  var i = rel.lastIndexOf('/');
  var parent = await dirByPath(i < 0 ? '' : rel.slice(0, i), create);
  var dir = await parent.getDirectoryHandle(i < 0 ? rel : rel.slice(i + 1), { create: !!create });
  dirCache.set(rel, dir);
  return dir;
}

// ---- wasm ops ---------------------------------------------------------------
var stats = { calls: 0, ms: 0, bytesRead: 0, bytesWritten: 0, byOp: {} };
function count(op, ms) {
  stats.calls++;
  stats.ms += ms;
  var o = stats.byOp[op] || (stats.byOp[op] = { calls: 0, ms: 0 });
  o.calls++;
  o.ms += ms;
}

function runSync(op, s) {
  switch (op) {
  case OP.CLOSE: closeAccess(accessOf(arg(s, 0)), true); return [0];
  case OP.READ: {
    var rec = accessOf(arg(s, 0)), p = arg(s, 1) >>> 0, n = arg(s, 2);
    var got = n ? rec.sah.read(U8.subarray(p, p + n), { at: arg(s, 3) }) : 0;
    stats.bytesRead += got;
    return [got];
  }
  case OP.WRITE: {
    var wrec = accessOf(arg(s, 0)), wp = arg(s, 1) >>> 0, wn = arg(s, 2);
    var put = wn ? wrec.sah.write(U8.subarray(wp, wp + wn), { at: arg(s, 3) }) : 0;
    stats.bytesWritten += put;
    return [put];
  }
  case OP.SIZE_ACCESS: return [accessOf(arg(s, 0)).sah.getSize()];
  case OP.TRUNC_ACCESS: accessOf(arg(s, 0)).sah.truncate(arg(s, 1)); return [0];
  case OP.FREE_NODE: freeNode(arg(s, 0)); return [0];
  }
  throw fsError('NOSYS', 'op ' + op);
}

async function runAsync(op, s) {
  switch (op) {
  case OP.CHILD: {
    var dir = node(arg(s, 0)), name = readName(s, 1, 2), path = join(dir.path, name);
    try {
      return [1, addNode('file', await dir.handle.getFileHandle(name), path)];
    } catch (e) {
      if (e.name !== 'TypeMismatchError') throw e;
    }
    return [2, addNode('dir', await dir.handle.getDirectoryHandle(name), path)];
  }
  case OP.INSERT_FILE: {
    var fdir = node(arg(s, 0)), fname = readName(s, 1, 2);
    var fpath = join(fdir.path, fname);
    var fh = await fdir.handle.getFileHandle(fname, { create: true });
    var fid = addNode('file', fh, fpath);
    // WasmFS opens a file right after creating it: hand back an open access
    // handle with the create so that open needs no second round trip.
    return [fid, (await openAccess(fpath, fh)).id];
  }
  case OP.INSERT_DIR: {
    var ddir = node(arg(s, 0)), dname = readName(s, 1, 2);
    var dh = await ddir.handle.getDirectoryHandle(dname, { create: true });
    return [addNode('dir', dh, join(ddir.path, dname))];
  }
  case OP.REMOVE: {
    var rdir = node(arg(s, 0)), rname = readName(s, 1, 2), rpath = join(rdir.path, rname);
    releaseHandlesUnder(rpath);
    await rdir.handle.removeEntry(rname);
    forgetDirs(rpath);
    return [0];
  }
  case OP.ENTRIES: {
    var edir = node(arg(s, 0)), buf = arg(s, 1) >>> 0, cap = arg(s, 2);
    var enc = new TextEncoder(), parts = [], bytes = 0;
    for await (var entry of edir.handle.entries()) {
      var nb = enc.encode(entry[0]);
      parts.push([entry[1].kind === 'directory' ? 2 : 1, nb]);
      bytes += 3 + nb.length;
    }
    if (bytes > cap) return [-ERR.RANGE, bytes];
    views();
    var at = buf;
    parts.forEach(function (p) {
      U8[at] = p[0];
      U8[at + 1] = p[1].length & 255;
      U8[at + 2] = p[1].length >> 8;
      U8.set(p[1], at + 3);
      at += 3 + p[1].length;
    });
    return [parts.length, bytes];
  }
  case OP.MOVE: {
    var moved = node(arg(s, 0)), target = node(arg(s, 1)), mname = readName(s, 2, 3);
    var from = moved.path, to = join(target.path, mname);
    if (from === to) return [0];
    releaseHandlesUnder(from);
    // WasmFS resolves the target before a rename, so an existing target always
    // has a live node here; no node means nothing to replace.
    if (nodesAtPath.has(to)) {
      releaseHandlesUnder(to);
      // WasmFS already checked the replace rules (type match, empty dir).
      try {
        await target.handle.removeEntry(mname);
      } catch (e) {
        if (e.name !== 'NotFoundError') throw e;
      }
    }
    await moved.handle.move(target.handle, mname);
    forgetDirs(from);
    forgetDirs(to);
    renamePaths(from, to);
    return [0];
  }
  case OP.OPEN: {
    var file = node(arg(s, 0));
    return [(await openAccess(file.path, file.handle)).id];
  }
  case OP.SIZE_FILE: {
    var sfile = node(arg(s, 0)), open = accessByPath.get(sfile.path);
    if (open) return [open.sah.getSize()];
    return [(await sfile.handle.getFile()).size];
  }
  case OP.TRUNC_FILE: {
    var tfile = node(arg(s, 0)), trec = await openAccess(tfile.path, tfile.handle);
    try {
      trec.sah.truncate(arg(s, 1));
    } finally {
      closeAccess(trec, true);
    }
    return [0];
  }
  }
  throw fsError('NOSYS', 'op ' + op);
}

function serveSlots() {
  views();
  for (var s = 0; s < L.count; s++) {
    if (Atomics.load(I32, slotState(s)) !== 1) continue;
    Atomics.store(I32, slotState(s), 2);
    var op = I32[slotOp(s)];
    if (SYNC_OPS.has(op)) {
      var t0 = performance.now();
      var r;
      try {
        r = runSync(op, s);
      } catch (e) {
        r = [errnoOf(e)];
      }
      count(OP_NAME[op], performance.now() - t0);
      finish(s, r[0], r[1]);
    } else {
      startAsync(op, s);
    }
  }
}
function startAsync(op, s) {
  var t0 = performance.now();
  runAsync(op, s).catch(function (e) {
    return [errnoOf(e)];
  }).then(function (r) {
    count(OP_NAME[op], performance.now() - t0);
    finish(s, r[0], r[1]);
  });
}

// ---- scheduling ---------------------------------------------------------------
var waitArmed = false;
function bellIdx() { return L.bell >> 2; }

/** Serve posted requests, then sleep on the bell without blocking the thread. */
function pump() {
  views();
  var bell = Atomics.load(I32, bellIdx());
  serveSlots();
  // An armed waiter wakes on the next ring; every request rings after posting.
  if (waitArmed) return;
  var w = Atomics.waitAsync(I32, bellIdx(), bell);
  if (!w.async) {
    queueMicrotask(pump);
    return;
  }
  waitArmed = true;
  w.value.then(function () {
    waitArmed = false;
    pump();
  });
}

// ---- portal ops (path based) --------------------------------------------------
function relOf(abs) {
  if (typeof abs !== 'string') throw fsError('INVAL', 'path required');
  if (abs === '/home/web_user') return '';
  if (abs.indexOf('/home/web_user/') === 0) return abs.slice(15).replace(/\/+$/, '');
  if (abs === '/mods' || abs.indexOf('/mods/') === 0) return abs.slice(1).replace(/\/+$/, '');
  throw fsError('INVAL', 'path outside qtclient-fs roots: ' + abs);
}
function splitRel(rel) {
  var i = rel.lastIndexOf('/');
  return i < 0 ? { dir: '', name: rel } : { dir: rel.slice(0, i), name: rel.slice(i + 1) };
}
async function fileAccess(rel, create) {
  var parts = splitRel(rel);
  if (!parts.name) throw fsError('ISDIR', rel);
  var dir = await dirByPath(parts.dir, create);
  return openAccess(rel, await dir.getFileHandle(parts.name, { create: !!create }));
}
var portalOps = {
  writeFile: async function (m) {
    var rec = await fileAccess(relOf(m.path), true);
    try {
      var bytes = new Uint8Array(m.data);
      rec.sah.truncate(0);
      var n = bytes.byteLength ? rec.sah.write(bytes, { at: 0 }) : 0;
      if (n !== bytes.byteLength) {
        throw fsError('IO', 'short write ' + m.path + ': wrote ' + n + ' of ' + bytes.byteLength +
          ' (file size now ' + rec.sah.getSize() + ')');
      }
      stats.bytesWritten += n;
    } finally {
      closeAccess(rec, false);
    }
    return {};
  },
  readFile: async function (m) {
    var rec = await fileAccess(relOf(m.path), false);
    try {
      var size = rec.sah.getSize();
      var buf = new Uint8Array(size);
      var n = size ? rec.sah.read(buf, { at: 0 }) : 0;
      if (n !== size) throw fsError('IO', 'short read ' + m.path);
      stats.bytesRead += n;
      return { data: buf.buffer, transfer: [buf.buffer] };
    } finally {
      closeAccess(rec, false);
    }
  },
  stats: async function () {
    return { stats: stats, openHandles: accessByPath.size, idleHandles: idle.length, nodes: nodes.size };
  },
};

function portalErrorName(e) {
  return ownCode(e) || (e && e.name) || 'Error';
}

self.onmessage = function (ev) {
  var m = ev.data || {};
  if (m.type === 'init') {
    if (typeof Atomics.waitAsync !== 'function') {
      self.postMessage({ type: 'init-failed', message: 'Atomics.waitAsync is unavailable in this browser' });
      return;
    }
    navigator.storage.getDirectory().then(function (dir) {
      root = dir;
      self.postMessage({ type: 'ready', protocol: PROTOCOL });
    }, function (e) {
      self.postMessage({ type: 'init-failed', message: String(e && e.message || e) });
    });
    return;
  }
  if (m.type === 'attach') {
    if (m.protocol !== PROTOCOL) {
      self.postMessage({ type: 'attach-failed', message: 'protocol ' + m.protocol + ' != worker ' + PROTOCOL });
      return;
    }
    memory = m.memory;
    L = m.layout;
    ERR = m.errno;
    views();
    nodes.set(1, { kind: 'dir', handle: root, path: '' });
    countPath('', 1);
    self.postMessage({ type: 'attached' });
    setTimeout(pump, 0);
    return;
  }
  if (m.type === 'ring') {
    if (L) pump();
    return;
  }
  if (m.type !== 'req') return;
  var op = portalOps[m.op];
  Promise.resolve().then(function () {
    if (!op) throw fsError('NOSYS', 'unknown op ' + m.op);
    return op(m);
  }).then(function (res) {
    var transfer = res.transfer || [];
    delete res.transfer;
    res.type = 'res';
    res.id = m.id;
    res.ok = true;
    self.postMessage(res, transfer);
  }, function (e) {
    self.postMessage({ type: 'res', id: m.id, ok: false, error: portalErrorName(e), message: String(e && e.message || e) });
  });
};
`;

export const GET: RequestHandler = async () =>
	new Response(WORKER_JS, { status: 200, headers });

export const HEAD: RequestHandler = async () =>
	new Response(null, { status: 200, headers });
