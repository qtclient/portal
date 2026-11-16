import type { RequestHandler } from './$types';

/**
 * Same-origin COEP qtclient-fs Worker script for Module.qtclientFs.
 * Safari refuses SharedArrayBuffer → Worker unless the script response has COEP.
 *
 * Lazy OPFS: createSyncAccessHandle on open only (LRU). Portal/wasm must
 * await qtclient-fs RPC via JSPI/waitAsync so the main thread yields — Safari
 * will not finish async OPFS while the main thread busy-spins.
 */
const coepHeaders: Record<string, string> = {
	'Content-Type': 'text/javascript; charset=utf-8',
	'Cache-Control': 'no-store',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
};

// Classic worker — keep in sync with qtclient-fs/opfs-worker.ts + protocol.ts.
const WORKER_JS = String.raw`
'use strict';
var STATE_IDLE = 0, STATE_PENDING = 1, STATE_DONE = 2;
var HDR_STATE = 0, HDR_OP = 1, HDR_RESULT = 2, HDR_ARG0 = 3, HDR_ARG1 = 4, HDR_ARG2 = 5, HDR_PATH_LEN = 6, HDR_DATA_LEN = 7;
var OP_PING = 0, OP_OPEN = 1, OP_CLOSE = 2, OP_READ = 3, OP_WRITE = 4, OP_SEEK = 5, OP_STAT = 6, OP_MKDIR = 7, OP_RMDIR = 8, OP_UNLINK = 9, OP_RENAME = 10, OP_READDIR = 11, OP_TRUNCATE = 12, OP_FLUSH = 13, OP_EXISTS = 14, OP_RELEASE_ALL = 15, OP_PUT_FILE = 16;
var OPEN_READ = 1, OPEN_WRITE = 2, OPEN_TRUNC = 4, OPEN_APPEND = 8, OPEN_CREATE = 16;
var HEADER_BYTES = 64, PATH_MAX = 4096, SAB_BYTES = 2 * 1024 * 1024;
var DATA_MAX = SAB_BYTES - HEADER_BYTES - PATH_MAX;
var LRU_MAX = 96;
var pathOff = HEADER_BYTES, dataOff = HEADER_BYTES + PATH_MAX;

var sab = null, i32 = null, u8 = null, root = null;
var files = new Map();
var nextFd = 3;
/** path → { access, size } — lazy SyncAccessHandles, LRU capped. */
var pool = new Map();
var lru = [];

function normPath(absPath) {
  var p = absPath.charAt(0) === '/' ? absPath : '/' + absPath;
  if (p.length > 1 && p.charAt(p.length - 1) === '/') p = p.slice(0, -1);
  return p;
}
function relFromAbs(absPath) {
  var p = normPath(absPath);
  if (p === '/home/web_user') return '';
  if (p.indexOf('/home/web_user/') === 0) return p.slice('/home/web_user/'.length);
  if (p === '/mods' || p.indexOf('/mods/') === 0) return p.slice(1);
  if (p === '/data' || p.indexOf('/data/') === 0) return p.slice(1);
  throw new Error('qtclient-fs path outside allowed roots');
}
function setResult(code, arg0, arg1, dataLen) {
  i32[HDR_RESULT] = code|0;
  i32[HDR_ARG0] = arg0|0;
  i32[HDR_ARG1] = arg1|0;
  i32[HDR_DATA_LEN] = dataLen|0;
}
function decodeShared(offset, len) {
  var copy = new Uint8Array(len);
  copy.set(u8.subarray(offset, offset + len));
  return new TextDecoder().decode(copy);
}
function readPath() {
  var len = i32[HDR_PATH_LEN]|0;
  if (len <= 0 || len > PATH_MAX) throw new Error('bad path len');
  return normPath(decodeShared(pathOff, len));
}
function readPath2() {
  var total = i32[HDR_PATH_LEN]|0;
  var p1 = i32[HDR_ARG2]|0;
  if (p1 <= 0 || total <= p1 + 1) throw new Error('bad rename paths');
  return normPath(decodeShared(pathOff + p1 + 1, total - p1 - 1));
}
async function ensureDir(base, relDir, create) {
  if (!relDir) return base;
  var cur = base;
  var parts = relDir.split('/').filter(Boolean);
  for (var i = 0; i < parts.length; i++) {
    cur = await cur.getDirectoryHandle(parts[i], { create: !!create });
  }
  return cur;
}
async function resolveParent(absPath, create) {
  var rel = relFromAbs(absPath);
  var parts = rel.split('/').filter(Boolean);
  var name = parts.pop();
  if (!name) throw new Error('invalid path');
  var dir = await ensureDir(root, parts.join('/'), create);
  return { dir: dir, name: name };
}
function touchLru(path) {
  var i = lru.indexOf(path);
  if (i >= 0) lru.splice(i, 1);
  lru.push(path);
}
function entrySize(ent) {
  if (ent.access) {
    try { return ent.access.getSize(); } catch (e) { return ent.size|0; }
  }
  return ent.mem ? ent.mem.byteLength : (ent.size|0);
}
function evictLruIfNeeded() {
  while (lru.length > LRU_MAX) {
    var old = lru.shift();
    var ent = pool.get(old);
    if (!ent) continue;
    var inUse = false;
    files.forEach(function (f) { if (f.path === old) inUse = true; });
    if (inUse) { lru.push(old); break; }
    if (ent.access) {
      try { ent.access.close(); } catch (e) {}
    }
    pool.delete(old);
  }
}
async function getAccess(path, create) {
  var ent = pool.get(path);
  if (ent) {
    touchLru(path);
    return ent;
  }
  var parent;
  try {
    parent = await resolveParent(path, create);
  } catch (e0) {
    return null;
  }
  var fh;
  try {
    fh = await parent.dir.getFileHandle(parent.name, { create: !!create });
  } catch (e) {
    return null;
  }
  // Prefer getFile() memory mirror. SyncAccessHandle often binds a stale/zero
  // view after portal/PutFile wrote via createWritable (main or worker), while
  // getFile() still sees the real bytes — that yielded empty mod.json/catalog
  // for QFile. Safari also throws NotFoundError on createSyncAccessHandle.
  // Writable random-access still uses SyncAccessHandle when available.
  try {
    var file = await fh.getFile();
    var buf = new Uint8Array(await file.arrayBuffer());
    ent = { access: null, mem: buf, size: buf.byteLength, fh: fh };
  } catch (e1) {
    try {
      var access = await fh.createSyncAccessHandle();
      ent = { access: access, mem: null, size: access.getSize() };
    } catch (e2) {
      return null;
    }
  }
  pool.set(path, ent);
  touchLru(path);
  evictLruIfNeeded();
  return ent;
}
async function opOpen() {
  var path = readPath();
  var flags = i32[HDR_ARG0]|0;
  var create = (flags & OPEN_CREATE) !== 0 || (flags & OPEN_WRITE) !== 0;
  var writable = (flags & OPEN_WRITE) !== 0;
  var ent = await getAccess(path, create);
  if (!ent) { setResult(-2); return; }
  if (flags & OPEN_TRUNC) {
    if (ent.access) {
      ent.access.truncate(0);
      ent.size = 0;
    } else {
      ent.mem = new Uint8Array(0);
      ent.size = 0;
    }
  }
  var size = entrySize(ent);
  ent.size = size;
  var pos = (flags & OPEN_APPEND) !== 0 ? size : 0;
  var fd = nextFd++;
  files.set(fd, { path: path, pos: pos, writable: writable, ent: ent });
  setResult(0, fd, size, 0);
}
async function persistMemEntry(path, ent) {
  if (!ent || ent.access || !ent.mem || !ent.fh) return;
  try {
    var w = await ent.fh.createWritable({ keepExistingData: false });
    await w.write(ent.mem);
    await w.close();
  } catch (e) {
    // Prefer SyncAccessHandle rewrite when createWritable is locked.
    try {
      var access = await ent.fh.createSyncAccessHandle();
      access.truncate(0);
      access.write(ent.mem, { at: 0 });
      access.flush();
      access.close();
    } catch (e2) {}
  }
}
async function opClose() {
  var fd = i32[HDR_ARG0]|0;
  var f = files.get(fd);
  if (!f) { setResult(-9); return; }
  if (f.ent.access) {
    try { f.ent.access.flush(); } catch (e) {}
  } else if (f.writable) {
    await persistMemEntry(f.path, f.ent);
  }
  f.ent.size = entrySize(f.ent);
  files.delete(fd);
  setResult(0, 0, 0, 0);
}
function opRead() {
  var fd = i32[HDR_ARG0]|0;
  var maxlen = Math.min(i32[HDR_ARG1]|0, DATA_MAX);
  var f = files.get(fd);
  if (!f) { setResult(-9); return; }
  var n = 0;
  if (f.ent.access) {
    var buf = new Uint8Array(maxlen);
    n = f.ent.access.read(buf, { at: f.pos });
    u8.set(buf.subarray(0, n), dataOff);
  } else {
    var mem = f.ent.mem || new Uint8Array(0);
    n = Math.max(0, Math.min(maxlen, mem.byteLength - f.pos));
    if (n > 0) u8.set(mem.subarray(f.pos, f.pos + n), dataOff);
  }
  f.pos += n;
  setResult(0, n, f.pos, n);
}
function opWrite() {
  var fd = i32[HDR_ARG0]|0;
  var len = Math.min(i32[HDR_DATA_LEN]|0, DATA_MAX);
  var f = files.get(fd);
  if (!f || !f.writable) { setResult(-9); return; }
  var slice = u8.subarray(dataOff, dataOff + len);
  var n = 0;
  if (f.ent.access) {
    n = f.ent.access.write(slice, { at: f.pos });
    f.pos += n;
    f.ent.size = f.ent.access.getSize();
  } else {
    var mem = f.ent.mem || new Uint8Array(0);
    var end = f.pos + len;
    if (end > mem.byteLength) {
      var grown = new Uint8Array(end);
      grown.set(mem);
      mem = grown;
      f.ent.mem = mem;
    }
    mem.set(slice, f.pos);
    f.pos = end;
    f.ent.size = mem.byteLength;
    n = len;
  }
  setResult(0, n, f.pos, 0);
}
function opSeek() {
  var fd = i32[HDR_ARG0]|0;
  var pos = i32[HDR_ARG1]|0;
  var f = files.get(fd);
  if (!f) { setResult(-9); return; }
  var size = entrySize(f.ent);
  f.pos = Math.max(0, Math.min(pos, size));
  setResult(0, f.pos, size, 0);
}
function opFlush() {
  var fd = i32[HDR_ARG0]|0;
  var f = files.get(fd);
  if (!f) { setResult(-9); return; }
  if (f.ent.access) {
    try { f.ent.access.flush(); } catch (e) {}
  }
  setResult(0, 0, 0, 0);
}
function opTruncate() {
  var fd = i32[HDR_ARG0]|0;
  var size = i32[HDR_ARG1]|0;
  var f = files.get(fd);
  if (!f || !f.writable) { setResult(-9); return; }
  if (f.ent.access) {
    f.ent.access.truncate(size);
    f.ent.size = size;
  } else {
    var mem = f.ent.mem || new Uint8Array(0);
    if (size < mem.byteLength) f.ent.mem = mem.subarray(0, size);
    else if (size > mem.byteLength) {
      var grown = new Uint8Array(size);
      grown.set(mem);
      f.ent.mem = grown;
    }
    f.ent.size = size;
  }
  if (f.pos > size) f.pos = size;
  setResult(0, f.pos, size, 0);
}
async function opStat() {
  var path = readPath();
  var rel = relFromAbs(path);
  if (!rel) { setResult(0, 1, 1, 0); i32[HDR_ARG2] = 0; return; }
  var parts = rel.split('/').filter(Boolean);
  var name = parts.pop();
  try {
    var dir = await ensureDir(root, parts.join('/'), false);
    try {
      await dir.getDirectoryHandle(name);
      setResult(0, 1, 1, 0); i32[HDR_ARG2] = 0; return;
    } catch (e1) {}
    var ent = pool.get(path);
    if (ent) {
      setResult(0, 1, 0, 0); i32[HDR_ARG2] = entrySize(ent)|0; return;
    }
    var fh = await dir.getFileHandle(name);
    var file = await fh.getFile();
    setResult(0, 1, 0, 0); i32[HDR_ARG2] = file.size|0;
  } catch (e2) {
    setResult(0, 0, 0, 0); i32[HDR_ARG2] = 0;
  }
}
async function opMkdir() {
  var path = readPath();
  try {
    await ensureDir(root, relFromAbs(path), true);
    setResult(0, 0, 0, 0);
  } catch (e) { setResult(-1); }
}
async function opRmdir() {
  try {
    var p = await resolveParent(readPath(), false);
    await p.dir.removeEntry(p.name, { recursive: false });
    setResult(0, 0, 0, 0);
  } catch (e) { setResult(-1); }
}
async function opUnlink() {
  var path = readPath();
  try {
    var ent = pool.get(path);
    if (ent) {
      try { ent.access.close(); } catch (e0) {}
      pool.delete(path);
      var i = lru.indexOf(path);
      if (i >= 0) lru.splice(i, 1);
    }
    var p = await resolveParent(path, false);
    await p.dir.removeEntry(p.name);
    setResult(0, 0, 0, 0);
  } catch (e) { setResult(-1); }
}
async function opRename() {
  var from = readPath();
  var to = readPath2();
  try {
    var src = await resolveParent(from, false);
    var fh = await src.dir.getFileHandle(src.name);
    var file = await fh.getFile();
    var bytes = new Uint8Array(await file.arrayBuffer());
    var dst = await resolveParent(to, true);
    var out = await dst.dir.getFileHandle(dst.name, { create: true });
    var w = await out.createWritable();
    await w.write(bytes);
    await w.close();
    var ent = pool.get(from);
    if (ent) {
      try { ent.access.close(); } catch (e0) {}
      pool.delete(from);
    }
    await src.dir.removeEntry(src.name);
    setResult(0, 0, 0, 0);
  } catch (e) { setResult(-1); }
}
async function opReaddir() {
  var path = readPath();
  try {
    var dir = await ensureDir(root, relFromAbs(path), false);
    var names = [];
    for await (var ent of dir.entries()) names.push(ent[0]);
    // String.raw template: use fromCharCode — '\\\\0' becomes literal \\0, not NUL.
    var encoded = new TextEncoder().encode(names.join(String.fromCharCode(0)));
    if (encoded.byteLength > DATA_MAX) { setResult(-7); return; }
    u8.set(encoded, dataOff);
    setResult(0, names.length, 0, encoded.byteLength);
  } catch (e) { setResult(-2); }
}
function writeErr(msg) {
  try {
    var enc = new TextEncoder().encode(String(msg || 'error').slice(0, 200));
    u8.set(enc, dataOff);
    setResult(-1, 0, 0, enc.byteLength);
  } catch (e2) {
    setResult(-1);
  }
}
async function dispatch() {
  var op = i32[HDR_OP]|0;
  try {
    if (!root && op !== OP_PING) {
      writeErr('no OPFS root');
      return;
    }
    switch (op) {
      case OP_PING: setResult(0,0,0,0); break;
      case OP_OPEN: await opOpen(); break;
      case OP_CLOSE: await opClose(); break;
      case OP_READ: opRead(); break;
      case OP_WRITE: opWrite(); break;
      case OP_SEEK: opSeek(); break;
      case OP_FLUSH: opFlush(); break;
      case OP_TRUNCATE: opTruncate(); break;
      case OP_STAT: case OP_EXISTS: await opStat(); break;
      case OP_MKDIR: await opMkdir(); break;
      case OP_RMDIR: await opRmdir(); break;
      case OP_UNLINK: await opUnlink(); break;
      case OP_RENAME: await opRename(); break;
      case OP_READDIR: await opReaddir(); break;
      case OP_RELEASE_ALL: releaseAllHandles(); setResult(0,0,0,0); break;
      default: setResult(-38);
    }
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    console.warn('qtclient-fs worker op failed', op, msg);
    writeErr(msg);
  }
}
function releaseAllHandles() {
  files.clear();
  pool.forEach(function (ent) {
    if (ent.access) {
      try { ent.access.flush(); } catch (e1) {}
      try { ent.access.close(); } catch (e2) {}
    }
  });
  pool.clear();
  lru.length = 0;
}

/** Per-path chain — different paths run concurrent; same path stays serial. */
var pathChains = new Map();
var sabGate = Promise.resolve();
var sabHeld = false;
var msgInflight = 0;
var sabWait = [];

function lockPath(path, fn) {
  var key = normPath(path || '');
  var prev = pathChains.get(key) || Promise.resolve();
  var release;
  var gate = new Promise(function (r) { release = r; });
  var chained = prev.catch(function () {}).then(function () { return gate; });
  pathChains.set(key, chained);
  return prev.catch(function () {}).then(fn).finally(function () {
    release();
    if (pathChains.get(key) === chained) pathChains.delete(key);
  });
}

function lockPaths(paths, fn) {
  var uniq = [];
  var seen = {};
  for (var i = 0; i < paths.length; i++) {
    var p = normPath(paths[i] || '');
    if (!p || seen[p]) continue;
    seen[p] = 1;
    uniq.push(p);
  }
  uniq.sort();
  var idx = 0;
  function next() {
    if (idx >= uniq.length) return fn();
    var path = uniq[idx++];
    return lockPath(path, next);
  }
  return next();
}

function reply(id, result, arg0, arg1, arg2, dataBuf) {
  var msg = {
    type: 'res',
    id: id,
    result: result|0,
    arg0: arg0|0,
    arg1: arg1|0,
    arg2: arg2|0
  };
  // Must set msg.data before transfer — a transfer-list entry that is not
  // referenced by the payload is discarded, so Read/Readdir arrived with
  // n>0 but empty bytes (QFile saw zeros → invalid mod.json / empty catalog).
  if (dataBuf) {
    msg.data = dataBuf;
    self.postMessage(msg, [dataBuf]);
  } else {
    self.postMessage(msg);
  }
}

function dropPoolPath(path) {
  var ent = pool.get(path);
  if (!ent) return;
  if (ent.access) {
    try { ent.access.flush(); } catch (e1) {}
    try { ent.access.close(); } catch (e2) {}
  }
  pool.delete(path);
  var i = lru.indexOf(path);
  if (i >= 0) lru.splice(i, 1);
  var dead = [];
  files.forEach(function (f, fd) {
    if (f.path === path) dead.push(fd);
  });
  for (var d = 0; d < dead.length; d++) files.delete(dead[d]);
}

async function opPutFileBytes(path, bytes) {
  dropPoolPath(path);
  var parent = await resolveParent(path, true);
  var fh = await parent.dir.getFileHandle(parent.name, { create: true });
  // createWritable first so subsequent getFile()/mem opens see real bytes.
  // SyncAccessHandle-first left handles that read as all-zero after mix with
  // portal createWritable writers.
  try {
    var w = await fh.createWritable({ keepExistingData: false });
    try {
      if (bytes && bytes.byteLength) await w.write(bytes);
    } finally {
      await w.close();
    }
    return 0;
  } catch (e1) {
    var access = await fh.createSyncAccessHandle();
    try {
      access.truncate(0);
      if (bytes && bytes.byteLength) access.write(bytes, { at: 0 });
      access.flush();
    } finally {
      access.close();
    }
    return 0;
  }
}

async function waitSabClear() {
  while (sabHeld) {
    await new Promise(function (r) { sabWait.push(r); });
  }
}

function releaseSabWaiters() {
  var q = sabWait;
  sabWait = [];
  for (var i = 0; i < q.length; i++) q[i]();
}

async function handleMsgReq(data) {
  await waitSabClear();
  msgInflight++;
  try {
    var id = data.id|0;
    var op = data.op|0;
    if (op === OP_PING) {
      reply(id, 0, 0, 0, 0, null);
      return;
    }
    if (op === OP_RELEASE_ALL) {
      await lockPaths(['\0release'], async function () {
        releaseAllHandles();
        reply(id, 0, 0, 0, 0, null);
      });
      return;
    }
    if (!root) {
      reply(id, -5, 0, 0, 0, null);
      return;
    }
    if (op === OP_OPEN) {
      await lockPath(data.path, async function () {
        try {
          var create = ((data.flags|0) & (OPEN_CREATE|OPEN_WRITE)) !== 0;
          var writable = ((data.flags|0) & OPEN_WRITE) !== 0;
          var path = normPath(data.path);
          var ent = await getAccess(path, create);
          if (!ent) { reply(id, -2, 0, 0, 0, null); return; }
          if ((data.flags|0) & OPEN_TRUNC) {
            if (ent.access) { ent.access.truncate(0); ent.size = 0; }
            else { ent.mem = new Uint8Array(0); ent.size = 0; }
          }
          var size = entrySize(ent);
          ent.size = size;
          var pos = ((data.flags|0) & OPEN_APPEND) !== 0 ? size : 0;
          var fd = nextFd++;
          files.set(fd, { path: path, pos: pos, writable: writable, ent: ent });
          reply(id, 0, fd, size, 0, null);
        } catch (err) {
          reply(id, -1, 0, 0, 0, null);
        }
      });
      return;
    }
    if (op === OP_CLOSE) {
      var fClose = files.get(data.fd|0);
      var closePath = fClose ? fClose.path : ('\0fd:' + (data.fd|0));
      await lockPath(closePath, async function () {
        var f = files.get(data.fd|0);
        if (!f) { reply(id, -9, 0, 0, 0, null); return; }
        if (f.ent.access) {
          try { f.ent.access.flush(); } catch (eCloseFlush) {}
        } else if (f.writable) {
          await persistMemEntry(f.path, f.ent);
        }
        f.ent.size = entrySize(f.ent);
        files.delete(data.fd|0);
        reply(id, 0, 0, 0, 0, null);
      });
      return;
    }
    if (op === OP_READ) {
      var fRead = files.get(data.fd|0);
      if (!fRead) { reply(id, -9, 0, 0, 0, null); return; }
      await lockPath(fRead.path, async function () {
        var f = files.get(data.fd|0);
        if (!f) { reply(id, -9, 0, 0, 0, null); return; }
        var maxlen = Math.min(data.arg1|0, DATA_MAX);
        if (maxlen < 0) maxlen = 0;
        var n = 0;
        var out = new Uint8Array(maxlen);
        if (f.ent.access) {
          n = f.ent.access.read(out, { at: f.pos });
        } else {
          var mem = f.ent.mem || new Uint8Array(0);
          n = Math.max(0, Math.min(maxlen, mem.byteLength - f.pos));
          if (n > 0) out.set(mem.subarray(f.pos, f.pos + n));
        }
        f.pos += n;
        var sliced = out.buffer.slice(0, n);
        reply(id, 0, n, f.pos, 0, sliced);
      });
      return;
    }
    if (op === OP_WRITE) {
      var fWrite = files.get(data.fd|0);
      if (!fWrite || !fWrite.writable) { reply(id, -9, 0, 0, 0, null); return; }
      await lockPath(fWrite.path, async function () {
        var f = files.get(data.fd|0);
        if (!f || !f.writable) { reply(id, -9, 0, 0, 0, null); return; }
        var bytes = data.data ? new Uint8Array(data.data) : new Uint8Array(0);
        var n = 0;
        if (f.ent.access) {
          n = f.ent.access.write(bytes, { at: f.pos });
          f.pos += n;
          f.ent.size = f.ent.access.getSize();
        } else {
          var memw = f.ent.mem || new Uint8Array(0);
          var end = f.pos + bytes.byteLength;
          if (end > memw.byteLength) {
            var grown = new Uint8Array(end);
            grown.set(memw);
            memw = grown;
            f.ent.mem = memw;
          }
          memw.set(bytes, f.pos);
          f.pos = end;
          f.ent.size = memw.byteLength;
          n = bytes.byteLength;
        }
        reply(id, 0, n, f.pos, 0, null);
      });
      return;
    }
    if (op === OP_SEEK) {
      var fSeek = files.get(data.fd|0);
      if (!fSeek) { reply(id, -9, 0, 0, 0, null); return; }
      await lockPath(fSeek.path, async function () {
        var f = files.get(data.fd|0);
        if (!f) { reply(id, -9, 0, 0, 0, null); return; }
        var size = entrySize(f.ent);
        f.pos = Math.max(0, Math.min(data.arg1|0, size));
        reply(id, 0, f.pos, size, 0, null);
      });
      return;
    }
    if (op === OP_FLUSH) {
      var fFlush = files.get(data.fd|0);
      if (!fFlush) { reply(id, -9, 0, 0, 0, null); return; }
      await lockPath(fFlush.path, async function () {
        var f = files.get(data.fd|0);
        if (!f) { reply(id, -9, 0, 0, 0, null); return; }
        if (f.ent.access) {
          try { f.ent.access.flush(); } catch (e3) {}
        } else if (f.writable) {
          await persistMemEntry(f.path, f.ent);
        }
        reply(id, 0, 0, 0, 0, null);
      });
      return;
    }
    if (op === OP_TRUNCATE) {
      var fTrunc = files.get(data.fd|0);
      if (!fTrunc || !fTrunc.writable) { reply(id, -9, 0, 0, 0, null); return; }
      await lockPath(fTrunc.path, async function () {
        var f = files.get(data.fd|0);
        if (!f || !f.writable) { reply(id, -9, 0, 0, 0, null); return; }
        var size = data.arg1|0;
        if (f.ent.access) { f.ent.access.truncate(size); f.ent.size = size; }
        else {
          var memt = f.ent.mem || new Uint8Array(0);
          if (size < memt.byteLength) f.ent.mem = memt.subarray(0, size);
          else if (size > memt.byteLength) {
            var gt = new Uint8Array(size);
            gt.set(memt);
            f.ent.mem = gt;
          }
          f.ent.size = size;
        }
        if (f.pos > size) f.pos = size;
        reply(id, 0, 0, 0, 0, null);
      });
      return;
    }
    if (op === OP_STAT || op === OP_EXISTS) {
      await lockPath(data.path, async function () {
        try {
          i32[HDR_PATH_LEN] = 0;
          var path = normPath(data.path);
          var rel = relFromAbs(path);
          if (!rel) { reply(id, 0, 1, 1, 0, null); return; }
          var parts = rel.split('/').filter(Boolean);
          var name = parts.pop();
          var dir = await ensureDir(root, parts.join('/'), false);
          try {
            await dir.getDirectoryHandle(name);
            reply(id, 0, 1, 1, 0, null);
            return;
          } catch (e4) {}
          var ent = pool.get(path);
          if (ent) {
            reply(id, 0, 1, 0, entrySize(ent), null);
            return;
          }
          var fh = await dir.getFileHandle(name);
          var file = await fh.getFile();
          reply(id, 0, 1, 0, file.size|0, null);
        } catch (e5) {
          reply(id, 0, 0, 0, 0, null);
        }
      });
      return;
    }
    if (op === OP_MKDIR) {
      await lockPath(data.path, async function () {
        try {
          await ensureDir(root, relFromAbs(normPath(data.path)), true);
          reply(id, 0, 0, 0, 0, null);
        } catch (e6) { reply(id, -1, 0, 0, 0, null); }
      });
      return;
    }
    if (op === OP_RMDIR) {
      await lockPath(data.path, async function () {
        try {
          var rp = await resolveParent(normPath(data.path), false);
          await rp.dir.removeEntry(rp.name, { recursive: false });
          reply(id, 0, 0, 0, 0, null);
        } catch (e7) { reply(id, -1, 0, 0, 0, null); }
      });
      return;
    }
    if (op === OP_UNLINK) {
      await lockPath(data.path, async function () {
        try {
          dropPoolPath(normPath(data.path));
          var up = await resolveParent(normPath(data.path), false);
          await up.dir.removeEntry(up.name);
          reply(id, 0, 0, 0, 0, null);
        } catch (e8) { reply(id, -1, 0, 0, 0, null); }
      });
      return;
    }
    if (op === OP_RENAME) {
      await lockPaths([data.path, data.path2], async function () {
        try {
          var from = normPath(data.path);
          var to = normPath(data.path2);
          dropPoolPath(from);
          dropPoolPath(to);
          var src = await resolveParent(from, false);
          var fh = await src.dir.getFileHandle(src.name);
          var file = await fh.getFile();
          var bytes = new Uint8Array(await file.arrayBuffer());
          var dst = await resolveParent(to, true);
          var out = await dst.dir.getFileHandle(dst.name, { create: true });
          var ww = await out.createWritable();
          await ww.write(bytes);
          await ww.close();
          await src.dir.removeEntry(src.name);
          reply(id, 0, 0, 0, 0, null);
        } catch (e9) { reply(id, -1, 0, 0, 0, null); }
      });
      return;
    }
    if (op === OP_READDIR) {
      await lockPath(data.path, async function () {
        try {
          var path = normPath(data.path);
          var dir;
          if (path === '/home/web_user' || path === '/mods' || path === '/data') {
            dir = await ensureDir(root, relFromAbs(path), false);
          } else {
            var pr = await resolveParent(path, false);
            dir = await pr.dir.getDirectoryHandle(pr.name);
          }
          var names = [];
          for await (var ent of dir.entries()) names.push(ent[0]);
          var enc = new TextEncoder().encode(names.join('\0'));
          var buf = enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength);
          reply(id, 0, 0, 0, 0, buf);
        } catch (e10) { reply(id, -1, 0, 0, 0, null); }
      });
      return;
    }
    if (op === OP_PUT_FILE) {
      await lockPath(data.path, async function () {
        try {
          var bytes = data.data ? new Uint8Array(data.data) : new Uint8Array(0);
          var rc = await opPutFileBytes(normPath(data.path), bytes);
          reply(id, rc, bytes.byteLength, 0, 0, null);
        } catch (e11) { reply(id, -1, 0, 0, 0, null); }
      });
      return;
    }
    reply(id, -38, 0, 0, 0, null);
  } finally {
    msgInflight--;
  }
}

self.onmessage = async function (ev) {
  var data = ev.data || {};
  if (data.type === 'init') {
    sab = data.sab;
    i32 = new Int32Array(sab);
    u8 = new Uint8Array(sab);
    root = await navigator.storage.getDirectory();
    Atomics.store(i32, HDR_STATE, STATE_IDLE);
    self.postMessage({ type: 'ready' });
    return;
  }
  if (data.type === 'release') {
    releaseAllHandles();
    self.postMessage({ type: 'release-done' });
    return;
  }
  if (data.type === 'req') {
    void handleMsgReq(data);
    return;
  }
  if (data.type === 'rpc') {
    sabGate = sabGate.catch(function () {}).then(async function () {
      while (msgInflight > 0) {
        await new Promise(function (r) { setTimeout(r, 0); });
      }
      sabHeld = true;
      try {
        await dispatch();
        Atomics.store(i32, HDR_STATE, STATE_DONE);
        self.postMessage({ type: 'rpc-done' });
      } finally {
        sabHeld = false;
        releaseSabWaiters();
      }
    });
    await sabGate;
  }
};
`;

export const GET: RequestHandler = async () => {
	return new Response(WORKER_JS, { status: 200, headers: coepHeaders });
};

export const HEAD: RequestHandler = async () => {
	return new Response(null, { status: 200, headers: coepHeaders });
};
