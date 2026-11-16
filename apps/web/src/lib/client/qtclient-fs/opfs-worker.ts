/// <reference lib="webworker" />
/**
 * Dedicated Worker: lazy SyncAccessHandle tip I/O (LRU).
 *
 * Runtime script is the classic copy at `/play/qtclient-fs-worker` (+server.ts).
 * That classic worker owns message-id concurrent *Async RPCs + PutFile —
 * keep protocol enums aligned when editing either side.
 * Wasm must await RPCs (JSPI) so Safari can complete createSyncAccessHandle.
 */
import {
	QtclientFsHdr,
	QtclientFsOp,
	QtclientFsOpen,
	QtclientFsState,
	qtclientFsDataOffset,
	qtclientFsPathOffset,
	QTCLIENT_FS_DATA_MAX,
	QTCLIENT_FS_PATH_MAX,
} from './protocol.js';

type PoolEntry = {
	access: FileSystemSyncAccessHandle | null;
	mem: Uint8Array | null;
	size: number;
	fh?: FileSystemFileHandle;
};

type OpenFile = {
	path: string;
	pos: number;
	writable: boolean;
	ent: PoolEntry;
};

function entrySize(ent: PoolEntry): number {
	if (ent.access) return ent.access.getSize();
	return ent.mem?.byteLength ?? ent.size;
}

const LRU_MAX = 96;

let sab: SharedArrayBuffer | null = null;
let i32: Int32Array | null = null;
let u8: Uint8Array | null = null;
let root: FileSystemDirectoryHandle | null = null;
const files = new Map<number, OpenFile>();
let nextFd = 3;
const pool = new Map<string, PoolEntry>();
const lru: string[] = [];

function normPath(absPath: string): string {
	let p = absPath.startsWith('/') ? absPath : `/${absPath}`;
	if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
	return p;
}

function relFromAbs(absPath: string): string {
	const p = normPath(absPath);
	if (p === '/home/web_user') return '';
	if (p.startsWith('/home/web_user/')) return p.slice('/home/web_user/'.length);
	if (p === '/mods' || p.startsWith('/mods/')) return p.slice(1);
	if (p === '/data' || p.startsWith('/data/')) return p.slice(1);
	throw new Error(`qtclient-fs path outside allowed roots: ${absPath}`);
}

async function ensureDir(
	base: FileSystemDirectoryHandle,
	relDir: string,
	create: boolean,
): Promise<FileSystemDirectoryHandle> {
	if (!relDir) return base;
	let cur = base;
	for (const part of relDir.split('/').filter(Boolean)) {
		cur = await cur.getDirectoryHandle(part, { create });
	}
	return cur;
}

async function resolveParent(
	absPath: string,
	create: boolean,
): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
	if (!root) throw new Error('qtclient-fs worker: no OPFS root');
	const rel = relFromAbs(absPath);
	const parts = rel.split('/').filter(Boolean);
	const name = parts.pop();
	if (!name) throw new Error(`qtclient-fs invalid path ${absPath}`);
	const dir = await ensureDir(root, parts.join('/'), create);
	return { dir, name };
}

function decodeShared(offset: number, len: number): string {
	if (!u8) throw new Error('qtclient-fs sab missing');
	const copy = new Uint8Array(len);
	copy.set(u8.subarray(offset, offset + len));
	return new TextDecoder().decode(copy);
}

function readPath(): string {
	if (!u8 || !i32) throw new Error('qtclient-fs sab missing');
	const len = i32[QtclientFsHdr.PathLen] ?? 0;
	if (len <= 0 || len > QTCLIENT_FS_PATH_MAX) throw new Error('qtclient-fs bad path len');
	return normPath(decodeShared(qtclientFsPathOffset(), len));
}

function readPath2(): string {
	if (!u8 || !i32) throw new Error('qtclient-fs sab missing');
	const total = i32[QtclientFsHdr.PathLen] ?? 0;
	const p1 = i32[QtclientFsHdr.Arg2] ?? 0;
	if (p1 <= 0 || total <= p1 + 1) throw new Error('qtclient-fs bad rename paths');
	return normPath(decodeShared(qtclientFsPathOffset() + p1 + 1, total - p1 - 1));
}

function setResult(code: number, arg0 = 0, arg1 = 0, dataLen = 0): void {
	if (!i32) return;
	i32[QtclientFsHdr.Result] = code;
	i32[QtclientFsHdr.Arg0] = arg0;
	i32[QtclientFsHdr.Arg1] = arg1;
	i32[QtclientFsHdr.DataLen] = dataLen;
}

function touchLru(path: string): void {
	const i = lru.indexOf(path);
	if (i >= 0) lru.splice(i, 1);
	lru.push(path);
}

function evictLruIfNeeded(): void {
	while (lru.length > LRU_MAX) {
		const old = lru.shift();
		if (!old) break;
		const ent = pool.get(old);
		if (!ent) continue;
		let inUse = false;
		for (const f of files.values()) {
			if (f.path === old) inUse = true;
		}
		if (inUse) {
			lru.push(old);
			break;
		}
		if (ent.access) {
			try {
				ent.access.close();
			} catch {
				/* ignore */
			}
		}
		pool.delete(old);
	}
}

async function getAccess(
	path: string,
	create: boolean,
): Promise<PoolEntry | null> {
	const existing = pool.get(path);
	if (existing) {
		touchLru(path);
		return existing;
	}
	let parent: { dir: FileSystemDirectoryHandle; name: string };
	try {
		parent = await resolveParent(path, create);
	} catch {
		return null;
	}
	let fh: FileSystemFileHandle;
	try {
		fh = await parent.dir.getFileHandle(parent.name, { create });
	} catch {
		return null;
	}
	// Prefer getFile() memory mirror — SyncAccessHandle can bind a stale/zero
	// view after createWritable writes (portal / PutFile). See qtclient-fs-worker.
	let ent: PoolEntry;
	try {
		const file = await fh.getFile();
		const buf = new Uint8Array(await file.arrayBuffer());
		ent = { access: null, mem: buf, size: buf.byteLength, fh };
	} catch {
		try {
			const access = await fh.createSyncAccessHandle();
			ent = { access, mem: null, size: access.getSize() };
		} catch {
			return null;
		}
	}
	pool.set(path, ent);
	touchLru(path);
	evictLruIfNeeded();
	return ent;
}

async function opOpen(): Promise<void> {
	const path = readPath();
	const flags = i32![QtclientFsHdr.Arg0] ?? 0;
	const create =
		(flags & QtclientFsOpen.Create) !== 0 || (flags & QtclientFsOpen.Write) !== 0;
	const writable = (flags & QtclientFsOpen.Write) !== 0;
	const ent = await getAccess(path, create);
	if (!ent) {
		setResult(-2);
		return;
	}
	if (flags & QtclientFsOpen.Truncate) {
		if (ent.access) {
			ent.access.truncate(0);
			ent.size = 0;
		} else {
			ent.mem = new Uint8Array(0);
			ent.size = 0;
		}
	}
	const size = entrySize(ent);
	ent.size = size;
	const pos = (flags & QtclientFsOpen.Append) !== 0 ? size : 0;
	const fd = nextFd++;
	files.set(fd, { path, pos, writable, ent });
	setResult(0, fd, size);
}

function opClose(): void {
	const fd = i32![QtclientFsHdr.Arg0] ?? -1;
	const f = files.get(fd);
	if (!f) {
		setResult(-9);
		return;
	}
	if (f.ent.access) {
		try {
			f.ent.access.flush();
		} catch {
			/* ignore */
		}
	}
	f.ent.size = entrySize(f.ent);
	files.delete(fd);
	setResult(0);
}

function opRead(): void {
	const fd = i32![QtclientFsHdr.Arg0] ?? -1;
	const maxlen = Math.min(i32![QtclientFsHdr.Arg1] ?? 0, QTCLIENT_FS_DATA_MAX);
	const f = files.get(fd);
	if (!f || !u8) {
		setResult(-9);
		return;
	}
	let n = 0;
	if (f.ent.access) {
		const buf = new Uint8Array(maxlen);
		n = f.ent.access.read(buf, { at: f.pos });
		u8.set(buf.subarray(0, n), qtclientFsDataOffset());
	} else {
		const mem = f.ent.mem || new Uint8Array(0);
		n = Math.max(0, Math.min(maxlen, mem.byteLength - f.pos));
		if (n > 0) u8.set(mem.subarray(f.pos, f.pos + n), qtclientFsDataOffset());
	}
	f.pos += n;
	setResult(0, n, f.pos, n);
}

function opWrite(): void {
	const fd = i32![QtclientFsHdr.Arg0] ?? -1;
	const len = Math.min(i32![QtclientFsHdr.DataLen] ?? 0, QTCLIENT_FS_DATA_MAX);
	const f = files.get(fd);
	if (!f || !u8 || !f.writable) {
		setResult(-9);
		return;
	}
	const off = qtclientFsDataOffset();
	const slice = u8.subarray(off, off + len);
	let n = 0;
	if (f.ent.access) {
		n = f.ent.access.write(slice, { at: f.pos });
		f.pos += n;
		f.ent.size = f.ent.access.getSize();
	} else {
		let mem = f.ent.mem || new Uint8Array(0);
		const end = f.pos + len;
		if (end > mem.byteLength) {
			const grown = new Uint8Array(end);
			grown.set(mem);
			mem = grown;
			f.ent.mem = mem;
		}
		mem.set(slice, f.pos);
		f.pos = end;
		f.ent.size = mem.byteLength;
		n = len;
	}
	setResult(0, n, f.pos);
}

function opSeek(): void {
	const fd = i32![QtclientFsHdr.Arg0] ?? -1;
	const pos = i32![QtclientFsHdr.Arg1] ?? 0;
	const f = files.get(fd);
	if (!f) {
		setResult(-9);
		return;
	}
	const size = entrySize(f.ent);
	f.pos = Math.max(0, Math.min(pos, size));
	setResult(0, f.pos, size);
}

function opFlush(): void {
	const fd = i32![QtclientFsHdr.Arg0] ?? -1;
	const f = files.get(fd);
	if (!f) {
		setResult(-9);
		return;
	}
	if (f.ent.access) {
		try {
			f.ent.access.flush();
		} catch {
			/* ignore */
		}
	}
	setResult(0);
}

function opTruncate(): void {
	const fd = i32![QtclientFsHdr.Arg0] ?? -1;
	const size = i32![QtclientFsHdr.Arg1] ?? 0;
	const f = files.get(fd);
	if (!f || !f.writable) {
		setResult(-9);
		return;
	}
	if (f.ent.access) {
		f.ent.access.truncate(size);
		f.ent.size = size;
	} else {
		const mem = f.ent.mem || new Uint8Array(0);
		if (size < mem.byteLength) f.ent.mem = mem.subarray(0, size);
		else if (size > mem.byteLength) {
			const grown = new Uint8Array(size);
			grown.set(mem);
			f.ent.mem = grown;
		}
		f.ent.size = size;
	}
	if (f.pos > size) f.pos = size;
	setResult(0, f.pos, size);
}

async function opStat(): Promise<void> {
	const path = readPath();
	if (!root) {
		setResult(-5);
		return;
	}
	const rel = relFromAbs(path);
	if (!rel) {
		setResult(0, 1, 1, 0);
		i32![QtclientFsHdr.Arg2] = 0;
		return;
	}
	const parts = rel.split('/').filter(Boolean);
	const name = parts.pop()!;
	try {
		const dir = await ensureDir(root, parts.join('/'), false);
		try {
			await dir.getDirectoryHandle(name);
			setResult(0, 1, 1, 0);
			i32![QtclientFsHdr.Arg2] = 0;
			return;
		} catch {
			/* file? */
		}
		const ent = pool.get(path);
		if (ent) {
			setResult(0, 1, 0, 0);
			i32![QtclientFsHdr.Arg2] = entrySize(ent);
			return;
		}
		const fh = await dir.getFileHandle(name);
		const file = await fh.getFile();
		setResult(0, 1, 0, 0);
		i32![QtclientFsHdr.Arg2] = file.size;
	} catch {
		setResult(0, 0, 0, 0);
		i32![QtclientFsHdr.Arg2] = 0;
	}
}

async function opMkdir(): Promise<void> {
	const path = readPath();
	if (!root) {
		setResult(-5);
		return;
	}
	try {
		await ensureDir(root, relFromAbs(path), true);
		setResult(0);
	} catch {
		setResult(-1);
	}
}

async function opRmdir(): Promise<void> {
	try {
		const { dir, name } = await resolveParent(readPath(), false);
		await dir.removeEntry(name, { recursive: false });
		setResult(0);
	} catch {
		setResult(-1);
	}
}

async function opUnlink(): Promise<void> {
	const path = readPath();
	try {
		const ent = pool.get(path);
		if (ent) {
			if (ent.access) {
				try {
					ent.access.close();
				} catch {
					/* ignore */
				}
			}
			pool.delete(path);
			const i = lru.indexOf(path);
			if (i >= 0) lru.splice(i, 1);
		}
		const { dir, name } = await resolveParent(path, false);
		await dir.removeEntry(name);
		setResult(0);
	} catch {
		setResult(-1);
	}
}

async function opRename(): Promise<void> {
	const from = readPath();
	const to = readPath2();
	try {
		const src = await resolveParent(from, false);
		const fh = await src.dir.getFileHandle(src.name);
		const file = await fh.getFile();
		const bytes = new Uint8Array(await file.arrayBuffer());
		const dst = await resolveParent(to, true);
		const out = await dst.dir.getFileHandle(dst.name, { create: true });
		const w = await out.createWritable();
		await w.write(bytes);
		await w.close();
		const ent = pool.get(from);
		if (ent) {
			if (ent.access) {
				try {
					ent.access.close();
				} catch {
					/* ignore */
				}
			}
			pool.delete(from);
		}
		await src.dir.removeEntry(src.name);
		setResult(0);
	} catch {
		setResult(-1);
	}
}

async function opReaddir(): Promise<void> {
	if (!root || !u8) {
		setResult(-5);
		return;
	}
	try {
		const dir = await ensureDir(root, relFromAbs(readPath()), false);
		const names: string[] = [];
		for await (const [name] of (
			dir as FileSystemDirectoryHandle & {
				entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
			}
		).entries()) {
			names.push(name);
		}
		const encoded = new TextEncoder().encode(names.join('\0'));
		if (encoded.byteLength > QTCLIENT_FS_DATA_MAX) {
			setResult(-7);
			return;
		}
		u8.set(encoded, qtclientFsDataOffset());
		setResult(0, names.length, 0, encoded.byteLength);
	} catch {
		setResult(-2);
	}
}

function releaseAllHandles(): void {
	files.clear();
	for (const ent of pool.values()) {
		if (!ent.access) continue;
		try {
			ent.access.flush();
		} catch {
			/* ignore */
		}
		try {
			ent.access.close();
		} catch {
			/* ignore */
		}
	}
	pool.clear();
	lru.length = 0;
}

async function dispatch(): Promise<void> {
	if (!i32) return;
	const op = i32[QtclientFsHdr.Op] ?? -1;
	try {
		switch (op) {
			case QtclientFsOp.Ping:
				setResult(0);
				break;
			case QtclientFsOp.Open:
				await opOpen();
				break;
			case QtclientFsOp.Close:
				opClose();
				break;
			case QtclientFsOp.Read:
				opRead();
				break;
			case QtclientFsOp.Write:
				opWrite();
				break;
			case QtclientFsOp.Seek:
				opSeek();
				break;
			case QtclientFsOp.Flush:
				opFlush();
				break;
			case QtclientFsOp.Truncate:
				opTruncate();
				break;
			case QtclientFsOp.Stat:
			case QtclientFsOp.Exists:
				await opStat();
				break;
			case QtclientFsOp.Mkdir:
				await opMkdir();
				break;
			case QtclientFsOp.Rmdir:
				await opRmdir();
				break;
			case QtclientFsOp.Unlink:
				await opUnlink();
				break;
			case QtclientFsOp.Rename:
				await opRename();
				break;
			case QtclientFsOp.Readdir:
				await opReaddir();
				break;
			case QtclientFsOp.ReleaseAll:
				releaseAllHandles();
				setResult(0);
				break;
			default:
				setResult(-38);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.warn('qtclient-fs worker op failed', op, msg);
		setResult(-1);
	}
}

self.onmessage = async (ev: MessageEvent) => {
	const data = ev.data as
		| { type: 'init'; sab: SharedArrayBuffer }
		| { type: 'release' }
		| { type: 'rpc' };
	if (data?.type === 'init') {
		sab = data.sab;
		i32 = new Int32Array(sab);
		u8 = new Uint8Array(sab);
		root = await navigator.storage.getDirectory();
		Atomics.store(i32, QtclientFsHdr.State, QtclientFsState.Idle);
		(self as DedicatedWorkerGlobalScope).postMessage({ type: 'ready' });
		return;
	}
	if (data?.type === 'release') {
		releaseAllHandles();
		(self as DedicatedWorkerGlobalScope).postMessage({ type: 'release-done' });
		return;
	}
	if (data?.type === 'rpc') {
		await dispatch();
		if (i32) Atomics.store(i32, QtclientFsHdr.State, QtclientFsState.Done);
		(self as DedicatedWorkerGlobalScope).postMessage({ type: 'rpc-done' });
	}
};
