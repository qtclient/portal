/**
 * Main-thread qtclient-fs API over OPFS Worker.
 *
 * *Async methods use message-id RPCs (concurrent across different paths;
 * same-path serialized in the worker). SAB + Atomics remain for rare sync
 * fallbacks (rpcSpin) — those stay globally locked.
 *
 * Safari will not finish async OPFS while the browser main thread busy-spins.
 * Wasm calls via EM_ASYNC_JS + JSPI so QFile looks sync while the event loop
 * stays alive — lazy SyncAccessHandle open on Chrome and Safari.
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
	QTCLIENT_FS_SAB_BYTES,
	type QtclientFsStat,
} from './protocol.js';

export type QtclientFsSyncApi = {
	ready: boolean;
	/** Async open — preferred; yields so Safari OPFS can complete. */
	openAsync(path: string, flags: number): Promise<number>;
	closeAsync(fd: number): Promise<number>;
	readAsync(fd: number, out: Uint8Array): Promise<number>;
	writeAsync(fd: number, data: Uint8Array): Promise<number>;
	seekAsync(fd: number, pos: number): Promise<number>;
	flushAsync(fd: number): Promise<number>;
	truncateAsync(fd: number, size: number): Promise<number>;
	statAsync(path: string): Promise<QtclientFsStat>;
	existsAsync(path: string): Promise<boolean>;
	mkdirAsync(path: string, parents?: boolean): Promise<number>;
	rmdirAsync(path: string): Promise<number>;
	unlinkAsync(path: string): Promise<number>;
	renameAsync(from: string, to: string): Promise<number>;
	readdirAsync(path: string): Promise<string[]>;
	/** Drop every SyncAccessHandle so portal createWritable can run. */
	releaseAllAsync(): Promise<number>;
	/** One-shot write (create/truncate); preferred for portal pack install. */
	writeFileAsync(path: string, data: Uint8Array): Promise<number>;
	/**
	 * One-shot whole-file read assembled in JS. Prefer this for multi-MB tip
	 * assets (appearances/RCC): chunked EM_ASYNC_JS→HEAP copies across JSPI
	 * suspends corrupt QFile::readAll payloads even when worker bytes are fine.
	 */
	readFileAsync(path: string): Promise<Uint8Array | null>;
	/** Sync wrappers — only safe when worker op is synchronous (rare). Prefer *Async. */
	open(path: string, flags: number): number;
	close(fd: number): number;
	read(fd: number, out: Uint8Array): number;
	write(fd: number, data: Uint8Array): number;
	seek(fd: number, pos: number): number;
	flush(fd: number): number;
	truncate(fd: number, size: number): number;
	stat(path: string): QtclientFsStat;
	exists(path: string): boolean;
	mkdir(path: string, parents?: boolean): number;
	rmdir(path: string): number;
	unlink(path: string): number;
	rename(from: string, to: string): number;
	readdir(path: string): string[];
	shutdown(): void;
};

type QtclientFsModuleFlag = {
	qtclientFs?: QtclientFsSyncApi;
	/** Portal prepared durable FS roots (numeric flag; API is `qtclientFs`). */
	qtclientFsReady?: boolean | number;
	Module?: QtclientFsModuleFlag;
};

function canUseSharedArrayBuffer(): boolean {
	return (
		typeof SharedArrayBuffer !== 'undefined' &&
		typeof crossOriginIsolated !== 'undefined' &&
		crossOriginIsolated
	);
}

export async function createQtclientFsSyncBridge(): Promise<QtclientFsSyncApi | null> {
	if (typeof window === 'undefined') return null;
	if (!navigator.storage?.getDirectory) return null;
	if (!canUseSharedArrayBuffer()) return null;

	const sab = new SharedArrayBuffer(QTCLIENT_FS_SAB_BYTES);
	const i32 = new Int32Array(sab);
	const u8 = new Uint8Array(sab);
	Atomics.store(i32, QtclientFsHdr.State, QtclientFsState.Idle);

	const worker = new Worker('/play/qtclient-fs-worker', {
		name: 'qtclient-fs',
	});

	const ready = new Promise<void>((resolve, reject) => {
		const t = window.setTimeout(
			() => reject(new Error('qtclient-fs worker init timeout')),
			15000,
		);
		worker.onmessage = (ev: MessageEvent) => {
			if ((ev.data as { type?: string })?.type === 'ready') {
				window.clearTimeout(t);
				resolve();
			}
		};
		worker.onerror = (err) => {
			window.clearTimeout(t);
			reject(err.error ?? new Error(String(err.message)));
		};
	});

	worker.postMessage({ type: 'init', sab });
	await ready;

	const enc = new TextEncoder();
	let rpcDoneWaiter: (() => void) | null = null;
	let nextMsgId = 1;
	type MsgRes = {
		result: number;
		arg0: number;
		arg1: number;
		arg2: number;
		data?: ArrayBuffer;
	};
	const pendingMsg = new Map<
		number,
		{ resolve: (r: MsgRes) => void; reject: (e: Error) => void }
	>();

	worker.addEventListener('message', (ev: MessageEvent) => {
		const data = ev.data as {
			type?: string;
			id?: number;
			result?: number;
			arg0?: number;
			arg1?: number;
			arg2?: number;
			data?: ArrayBuffer;
		};
		if (data?.type === 'rpc-done') {
			rpcDoneWaiter?.();
			rpcDoneWaiter = null;
			return;
		}
		if (data?.type === 'res' && typeof data.id === 'number') {
			const waiter = pendingMsg.get(data.id);
			if (!waiter) return;
			pendingMsg.delete(data.id);
			waiter.resolve({
				result: data.result ?? -1,
				arg0: data.arg0 ?? 0,
				arg1: data.arg1 ?? 0,
				arg2: data.arg2 ?? 0,
				data: data.data,
			});
		}
	});

	function writePath(path: string): void {
		const bytes = enc.encode(path);
		if (bytes.byteLength > QTCLIENT_FS_PATH_MAX) {
			throw new Error(`qtclient-fs path too long: ${path.length}`);
		}
		u8.fill(0, qtclientFsPathOffset(), qtclientFsPathOffset() + QTCLIENT_FS_PATH_MAX);
		u8.set(bytes, qtclientFsPathOffset());
		i32[QtclientFsHdr.PathLen] = bytes.byteLength;
	}

	function writeRenamePaths(from: string, to: string): void {
		const a = enc.encode(from);
		const b = enc.encode(to);
		if (a.byteLength + 1 + b.byteLength > QTCLIENT_FS_PATH_MAX) {
			throw new Error('qtclient-fs rename paths too long');
		}
		const off = qtclientFsPathOffset();
		u8.fill(0, off, off + QTCLIENT_FS_PATH_MAX);
		u8.set(a, off);
		u8[off + a.byteLength] = 0;
		u8.set(b, off + a.byteLength + 1);
		i32[QtclientFsHdr.PathLen] = a.byteLength + 1 + b.byteLength;
		i32[QtclientFsHdr.Arg2] = a.byteLength;
	}

	type MsgFields = {
		path?: string;
		path2?: string;
		fd?: number;
		flags?: number;
		arg1?: number;
		data?: Uint8Array;
	};

	function msgRpc(op: QtclientFsOp, fields: MsgFields = {}): Promise<MsgRes> {
		const id = nextMsgId++;
		return new Promise<MsgRes>((resolve, reject) => {
			const t = window.setTimeout(() => {
				if (!pendingMsg.has(id)) return;
				pendingMsg.delete(id);
				reject(new Error('qtclient-fs message RPC timed out'));
			}, 120_000);
			pendingMsg.set(id, {
				resolve: (r) => {
					window.clearTimeout(t);
					resolve(r);
				},
				reject: (e) => {
					window.clearTimeout(t);
					reject(e);
				},
			});
			const msg: Record<string, unknown> = {
				type: 'req',
				id,
				op,
				path: fields.path,
				path2: fields.path2,
				fd: fields.fd,
				flags: fields.flags,
				arg1: fields.arg1,
			};
			const transfer: Transferable[] = [];
			if (fields.data) {
				const copy = new Uint8Array(fields.data.byteLength);
				copy.set(fields.data);
				msg.data = copy.buffer;
				transfer.push(copy.buffer);
			}
			worker.postMessage(msg, transfer);
		});
	}

	/** Busy-spin SAB — only for sync wrappers. Serialized vs other SAB ops. */
	function rpcSpin(op: QtclientFsOp): number {
		Atomics.store(i32, QtclientFsHdr.State, QtclientFsState.Pending);
		i32[QtclientFsHdr.Op] = op;
		i32[QtclientFsHdr.Result] = -1;
		worker.postMessage({ type: 'rpc' });
		const start =
			typeof performance !== 'undefined' ? performance.now() : Date.now();
		for (;;) {
			if (Atomics.load(i32, QtclientFsHdr.State) === QtclientFsState.Done) break;
			try {
				Atomics.wait(i32, QtclientFsHdr.State, QtclientFsState.Pending, 5);
			} catch {
				/* main thread */
			}
			const now =
				typeof performance !== 'undefined' ? performance.now() : Date.now();
			if (now - start > 60_000) {
				Atomics.store(i32, QtclientFsHdr.State, QtclientFsState.Idle);
				throw new Error('qtclient-fs sync RPC timed out');
			}
		}
		Atomics.store(i32, QtclientFsHdr.State, QtclientFsState.Idle);
		return i32[QtclientFsHdr.Result] ?? -1;
	}

	const api: QtclientFsSyncApi = {
		ready: true,
		async openAsync(path: string, flags: number): Promise<number> {
			const r = await msgRpc(QtclientFsOp.Open, { path, flags });
			return r.result === 0 ? r.arg0 : r.result;
		},
		async closeAsync(fd: number): Promise<number> {
			return (await msgRpc(QtclientFsOp.Close, { fd })).result;
		},
		async readAsync(fd: number, out: Uint8Array): Promise<number> {
			const r = await msgRpc(QtclientFsOp.Read, {
				fd,
				arg1: Math.min(out.byteLength, QTCLIENT_FS_DATA_MAX),
			});
			if (r.result !== 0) return r.result;
			const n = r.arg0;
			if (n > 0 && r.data) out.set(new Uint8Array(r.data, 0, n));
			return n;
		},
		async writeAsync(fd: number, data: Uint8Array): Promise<number> {
			const chunk =
				data.byteLength > QTCLIENT_FS_DATA_MAX
					? data.subarray(0, QTCLIENT_FS_DATA_MAX)
					: data;
			const r = await msgRpc(QtclientFsOp.Write, { fd, data: chunk });
			return r.result === 0 ? r.arg0 : r.result;
		},
		async seekAsync(fd: number, pos: number): Promise<number> {
			const r = await msgRpc(QtclientFsOp.Seek, { fd, arg1: pos | 0 });
			return r.result === 0 ? r.arg0 : r.result;
		},
		async flushAsync(fd: number): Promise<number> {
			return (await msgRpc(QtclientFsOp.Flush, { fd })).result;
		},
		async truncateAsync(fd: number, size: number): Promise<number> {
			return (await msgRpc(QtclientFsOp.Truncate, { fd, arg1: size | 0 })).result;
		},
		async statAsync(path: string): Promise<QtclientFsStat> {
			const r = await msgRpc(QtclientFsOp.Stat, { path });
			if (r.result !== 0) return { exists: false, isDir: false, size: 0 };
			return {
				exists: r.arg0 !== 0,
				isDir: r.arg1 !== 0,
				size: r.arg2,
			};
		},
		async existsAsync(path: string): Promise<boolean> {
			return (await api.statAsync(path)).exists;
		},
		async mkdirAsync(path: string, parents = true): Promise<number> {
			return (await msgRpc(QtclientFsOp.Mkdir, { path, arg1: parents ? 1 : 0 }))
				.result;
		},
		async rmdirAsync(path: string): Promise<number> {
			return (await msgRpc(QtclientFsOp.Rmdir, { path })).result;
		},
		async unlinkAsync(path: string): Promise<number> {
			return (await msgRpc(QtclientFsOp.Unlink, { path })).result;
		},
		async renameAsync(from: string, to: string): Promise<number> {
			return (await msgRpc(QtclientFsOp.Rename, { path: from, path2: to })).result;
		},
		async readdirAsync(path: string): Promise<string[]> {
			const r = await msgRpc(QtclientFsOp.Readdir, { path });
			if (r.result !== 0 || !r.data) return [];
			return new TextDecoder()
				.decode(new Uint8Array(r.data))
				.split('\0')
				.filter(Boolean);
		},
		async releaseAllAsync(): Promise<number> {
			return (await msgRpc(QtclientFsOp.ReleaseAll)).result;
		},
		async writeFileAsync(path: string, data: Uint8Array): Promise<number> {
			return (await msgRpc(QtclientFsOp.PutFile, { path, data })).result;
		},
		async readFileAsync(path: string): Promise<Uint8Array | null> {
			const opened = await msgRpc(QtclientFsOp.Open, {
				path,
				flags: QtclientFsOpen.Read,
			});
			if (opened.result !== 0) return null;
			const fd = opened.arg0;
			const size = Math.max(0, opened.arg1 | 0);
			try {
				const out = new Uint8Array(size);
				let pos = 0;
				while (pos < size) {
					const r = await msgRpc(QtclientFsOp.Read, {
						fd,
						arg1: Math.min(QTCLIENT_FS_DATA_MAX, size - pos),
					});
					if (r.result !== 0) return null;
					const n = r.arg0 | 0;
					if (n <= 0) break;
					if (!r.data) return null;
					out.set(new Uint8Array(r.data, 0, n), pos);
					pos += n;
				}
				return pos === size ? out : out.subarray(0, pos);
			} finally {
				await msgRpc(QtclientFsOp.Close, { fd });
			}
		},
		open(path: string, flags: number): number {
			// Sync fallback — will hang on Safari if open awaits OPFS.
			writePath(path);
			i32[QtclientFsHdr.Arg0] = flags;
			i32[QtclientFsHdr.DataLen] = 0;
			const rc = rpcSpin(QtclientFsOp.Open);
			return rc === 0 ? (i32[QtclientFsHdr.Arg0] ?? -1) : rc;
		},
		close(fd: number): number {
			i32[QtclientFsHdr.Arg0] = fd;
			return rpcSpin(QtclientFsOp.Close);
		},
		read(fd: number, out: Uint8Array): number {
			i32[QtclientFsHdr.Arg0] = fd;
			i32[QtclientFsHdr.Arg1] = Math.min(out.byteLength, QTCLIENT_FS_DATA_MAX);
			const rc = rpcSpin(QtclientFsOp.Read);
			if (rc !== 0) return rc;
			const n = i32[QtclientFsHdr.Arg0] ?? 0;
			out.set(u8.subarray(qtclientFsDataOffset(), qtclientFsDataOffset() + n));
			return n;
		},
		write(fd: number, data: Uint8Array): number {
			const n = Math.min(data.byteLength, QTCLIENT_FS_DATA_MAX);
			u8.set(data.subarray(0, n), qtclientFsDataOffset());
			i32[QtclientFsHdr.Arg0] = fd;
			i32[QtclientFsHdr.DataLen] = n;
			const rc = rpcSpin(QtclientFsOp.Write);
			return rc === 0 ? (i32[QtclientFsHdr.Arg0] ?? -1) : rc;
		},
		seek(fd: number, pos: number): number {
			i32[QtclientFsHdr.Arg0] = fd;
			i32[QtclientFsHdr.Arg1] = pos | 0;
			const rc = rpcSpin(QtclientFsOp.Seek);
			return rc === 0 ? (i32[QtclientFsHdr.Arg0] ?? -1) : rc;
		},
		flush(fd: number): number {
			i32[QtclientFsHdr.Arg0] = fd;
			return rpcSpin(QtclientFsOp.Flush);
		},
		truncate(fd: number, size: number): number {
			i32[QtclientFsHdr.Arg0] = fd;
			i32[QtclientFsHdr.Arg1] = size | 0;
			return rpcSpin(QtclientFsOp.Truncate);
		},
		stat(path: string): QtclientFsStat {
			writePath(path);
			const rc = rpcSpin(QtclientFsOp.Stat);
			if (rc !== 0) return { exists: false, isDir: false, size: 0 };
			return {
				exists: (i32[QtclientFsHdr.Arg0] ?? 0) !== 0,
				isDir: (i32[QtclientFsHdr.Arg1] ?? 0) !== 0,
				size: i32[QtclientFsHdr.Arg2] ?? 0,
			};
		},
		exists(path: string): boolean {
			return api.stat(path).exists;
		},
		mkdir(path: string, parents = true): number {
			writePath(path);
			i32[QtclientFsHdr.Arg0] = parents ? 1 : 0;
			return rpcSpin(QtclientFsOp.Mkdir);
		},
		rmdir(path: string): number {
			writePath(path);
			return rpcSpin(QtclientFsOp.Rmdir);
		},
		unlink(path: string): number {
			writePath(path);
			return rpcSpin(QtclientFsOp.Unlink);
		},
		rename(from: string, to: string): number {
			writeRenamePaths(from, to);
			return rpcSpin(QtclientFsOp.Rename);
		},
		readdir(path: string): string[] {
			writePath(path);
			const rc = rpcSpin(QtclientFsOp.Readdir);
			if (rc !== 0) return [];
			const len = i32[QtclientFsHdr.DataLen] ?? 0;
			if (len <= 0) return [];
			const copy = new Uint8Array(len);
			copy.set(u8.subarray(qtclientFsDataOffset(), qtclientFsDataOffset() + len));
			return new TextDecoder().decode(copy).split('\0').filter(Boolean);
		},
		shutdown(): void {
			api.ready = false;
			try {
				// Close SyncAccessHandles before kill — Safari keeps file locks
				// across refresh if the worker is terminated with handles open.
				// Do not terminate immediately: pagehide must let the worker
				// finish release; document teardown kills the worker.
				worker.postMessage({ type: 'release' });
			} catch {
				/* ignore */
			}
		},
	};

	await msgRpc(QtclientFsOp.Ping);
	return api;
}

/** Attach qtclient-fs to a Module (and globalThis.Module) for C++ EM_ASM / EM_ASYNC_JS. */
export function attachQtclientFsToModule(
	instance: QtclientFsModuleFlag,
	api: QtclientFsSyncApi,
): void {
	instance.qtclientFs = api;
	instance.qtclientFsReady = 1;
	const g = globalThis as unknown as QtclientFsModuleFlag;
	g.qtclientFs = api;
	g.qtclientFsReady = 1;
	try {
		if (g.Module) {
			g.Module.qtclientFs = api;
			g.Module.qtclientFsReady = 1;
		}
	} catch {
		/* Module may be non-configurable */
	}
}

/** Close qtclient-fs SyncAccessHandles if a bridge is live (portal createWritable). */
export async function releaseQtclientFsHandlesForPortalWrites(): Promise<void> {
	const g = globalThis as unknown as QtclientFsModuleFlag;
	const tip = g.qtclientFs;
	if (!tip?.ready || typeof tip.releaseAllAsync !== 'function') return;
	try {
		await tip.releaseAllAsync();
	} catch {
		/* ignore — write path retries anyway */
	}
}

export { QtclientFsOpen };
