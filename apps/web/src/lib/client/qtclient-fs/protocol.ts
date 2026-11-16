/**
 * Shared SAB layout for qtclient-fs RPC (main/Qt ↔ OPFS Worker).
 *
 * Prefer rpcAsync (Atomics.waitAsync / event-loop yield) + wasm JSPI so
 * Safari can complete lazy createSyncAccessHandle. Busy-spin only for ops the
 * worker finishes synchronously (already-open handle read/write).
 */

export const QTCLIENT_FS_SAB_BYTES = 2 * 1024 * 1024;
export const QTCLIENT_FS_HEADER_BYTES = 64;
export const QTCLIENT_FS_PATH_MAX = 4096;
export const QTCLIENT_FS_DATA_MAX =
	QTCLIENT_FS_SAB_BYTES - QTCLIENT_FS_HEADER_BYTES - QTCLIENT_FS_PATH_MAX;

export const enum QtclientFsState {
	Idle = 0,
	Pending = 1,
	Done = 2,
}

export const enum QtclientFsOp {
	Ping = 0,
	Open = 1,
	Close = 2,
	Read = 3,
	Write = 4,
	Seek = 5,
	Stat = 6,
	Mkdir = 7,
	Rmdir = 8,
	Unlink = 9,
	Rename = 10,
	Readdir = 11,
	Truncate = 12,
	Flush = 13,
	Exists = 14,
	/** Close every SyncAccessHandle — required before main-thread createWritable. */
	ReleaseAll = 15,
	/** One-shot create/truncate/write/close (message RPC; skips SAB chunking). */
	PutFile = 16,
}

/** Open flags (match a thin subset of POSIX / QIODevice). */
export const QtclientFsOpen = {
	Read: 1,
	Write: 2,
	ReadWrite: 3,
	Truncate: 4,
	Append: 8,
	Create: 16,
} as const;

export const QtclientFsHdr = {
	State: 0,
	Op: 1,
	Result: 2,
	Arg0: 3,
	Arg1: 4,
	Arg2: 5,
	PathLen: 6,
	DataLen: 7,
} as const;

export type QtclientFsStat = {
	exists: boolean;
	isDir: boolean;
	size: number;
};

export function qtclientFsPathOffset(): number {
	return QTCLIENT_FS_HEADER_BYTES;
}

export function qtclientFsDataOffset(): number {
	return QTCLIENT_FS_HEADER_BYTES + QTCLIENT_FS_PATH_MAX;
}
