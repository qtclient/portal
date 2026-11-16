/**
 * qtclient-fs — page-side client of the OPFS Worker (/play/qtclient-fs-worker).
 *
 * The Worker is the only OPFS accessor on /play. Two clients share it:
 *  - wasm: qtclient's WasmFS backend (browser/qtclient_opfs_backend.cpp) calls
 *    `Module.qtclientFs.attachWasm` once from main(); after that every POSIX
 *    file op under /home/web_user goes straight to the Worker through a request
 *    block in the wasm heap (no JS on this side per op);
 *  - portal code (tibia-browser.ts: pack staging, engine bytes, stats) through
 *    the async methods below.
 *
 * Paths are the wasm's: `/home/web_user/<rel>` is OPFS `<rel>`, and `/mods/<rel>`
 * (a symlink to /home/web_user/mods) is OPFS `mods/<rel>`. The Worker rejects
 * anything else.
 *
 * The Worker never blocks (it waits on the wasm request bell with
 * Atomics.waitAsync), so portal messages need no wake-up.
 */
import { diag, diagWarn } from '../play-diag.js';

/** Must match the Worker's PROTOCOL and qtclient_opfs_backend.cpp kProtocol. */
export const QTCLIENT_FS_PROTOCOL = 5;

/** Byte offsets of the wasm request block (published by the C++ side). */
export type QtclientFsWasmLayout = {
	bell: number;
	slots: number;
	stride: number;
	count: number;
	state: number;
	op: number;
	args: number;
	r0: number;
	r1: number;
};

export type QtclientFsWorkerStats = {
	stats: {
		calls: number;
		ms: number;
		bytesRead: number;
		bytesWritten: number;
		byOp: Record<string, { calls: number; ms: number }>;
	};
	openHandles: number;
	idleHandles: number;
	nodes: number;
};

export type QtclientFs = {
	protocol: number;
	/** Called by wasm main() before mounting the OPFS backend. */
	attachWasm(
		memory: WebAssembly.Memory,
		layout: QtclientFsWasmLayout,
		errno: Record<string, number>,
	): Promise<void>;
	/** Create/replace a whole file (parents created). */
	writeFileAsync(path: string, data: Uint8Array): Promise<void>;
	/** Whole file, or null when missing. */
	readFileAsync(path: string): Promise<Uint8Array | null>;
	statsAsync(): Promise<QtclientFsWorkerStats>;
	/**
	 * Resolves on the worker's next `main-done` message (a request in the
	 * wasm main thread's slot finished). The wasm main thread awaits this
	 * under JSPI: Safari leaves an Atomics.waitAsync resolution queued until
	 * some other task wakes the event loop, while a message is itself a task.
	 */
	mainDone(): Promise<void>;
	/**
	 * Wake the Worker for a request the wasm main thread just posted (the
	 * Worker's Atomics.waitAsync on the bell is not reliably woken in Safari).
	 */
	ring(): void;
};

type Res = {
	type: 'res';
	id: number;
	ok: boolean;
	error?: string;
	message?: string;
	data?: ArrayBuffer;
} & Partial<QtclientFsWorkerStats>;

let instance: Promise<QtclientFs> | null = null;

/** The page's qtclient-fs (spawns the Worker on first use). */
export function qtclientFs(): Promise<QtclientFs> {
	instance ??= spawn();
	return instance;
}

class QtclientFsError extends Error {
	constructor(
		readonly op: string,
		readonly path: unknown,
		readonly code: string,
		message: string,
	) {
		super(`qtclient-fs ${op} ${String(path ?? '')}: ${code} ${message}`);
	}
}

async function spawn(): Promise<QtclientFs> {
	if (!navigator.storage?.getDirectory) {
		throw new Error(
			'OPFS unavailable — /play needs the Origin Private File System',
		);
	}
	const worker = new Worker('/play/qtclient-fs-worker', {
		name: 'qtclient-fs',
	});
	const protocol = await new Promise<number>((resolve, reject) => {
		worker.onmessage = (ev: MessageEvent) => {
			const t =
				(ev.data as { type?: string; message?: string; protocol?: number }) ??
				{};
			if (t.type === 'ready') resolve(t.protocol ?? 0);
			else if (t.type === 'init-failed')
				reject(new Error(`qtclient-fs init: ${t.message}`));
		};
		worker.onerror = (ev) =>
			reject(ev.error instanceof Error ? ev.error : new Error(ev.message));
		worker.postMessage({ type: 'init' });
	});
	if (protocol !== QTCLIENT_FS_PROTOCOL) {
		throw new Error(
			`qtclient-fs worker protocol ${protocol} != page ${QTCLIENT_FS_PROTOCOL}`,
		);
	}

	const pending = new Map<number, (r: Res) => void>();
	let nextId = 1;
	let attached = false;
	let mainWake: (() => void) | null = null;
	let attachWaiter: {
		resolve: () => void;
		reject: (e: Error) => void;
	} | null = null;

	worker.onmessage = (ev: MessageEvent) => {
		const r = ev.data as
			| Res
			| {
					type: 'log' | 'attached' | 'attach-failed' | 'main-done';
					message?: string;
			  };
		if (r?.type === 'main-done') {
			const wake = mainWake;
			mainWake = null;
			wake?.();
			return;
		}
		if (r?.type === 'log') {
			diagWarn('qtclient-fs worker', { message: r.message });
			return;
		}
		if (r?.type === 'attached' || r?.type === 'attach-failed') {
			const w = attachWaiter;
			attachWaiter = null;
			if (r.type === 'attached') w?.resolve();
			else w?.reject(new Error(`qtclient-fs attach: ${r.message}`));
			return;
		}
		if (r?.type !== 'res') return;
		const done = pending.get(r.id);
		if (!done) return;
		pending.delete(r.id);
		done(r);
	};
	worker.onerror = (ev) => {
		diagWarn('qtclient-fs worker error', { message: ev.message });
	};
	// Release this document's OPFS access handles now rather than whenever the
	// browser tears the Worker down: the next /play document needs them.
	window.addEventListener('pagehide', (ev) => {
		if (!ev.persisted) worker.terminate();
	});

	function call(
		op: string,
		req: Record<string, unknown>,
		transfer: Transferable[] = [],
	): Promise<Res> {
		const id = nextId++;
		return new Promise<Res>((resolve, reject) => {
			pending.set(id, (r) => {
				if (r.ok) resolve(r);
				else
					reject(
						new QtclientFsError(
							op,
							req.path,
							r.error ?? 'Error',
							r.message ?? '',
						),
					);
			});
			worker.postMessage({ type: 'req', id, op, ...req }, transfer);
		});
	}

	const api: QtclientFs = {
		protocol,
		attachWasm(memory, layout, errno) {
			if (attached) throw new Error('qtclient-fs: wasm already attached');
			return new Promise<void>((resolve, reject) => {
				attachWaiter = {
					resolve: () => {
						attached = true;
						diag('qtclient-fs wasm attached', { slots: layout.count });
						resolve();
					},
					reject,
				};
				worker.postMessage({
					type: 'attach',
					protocol: QTCLIENT_FS_PROTOCOL,
					memory,
					layout,
					errno,
				});
			});
		},
		async writeFileAsync(path, data) {
			// Own copy: the caller's buffer stays usable.
			const copy = data.slice().buffer;
			await call('writeFile', { path, data: copy }, [copy]);
		},
		async readFileAsync(path) {
			try {
				return new Uint8Array((await call('readFile', { path })).data!);
			} catch (e) {
				if (e instanceof QtclientFsError && e.code === 'NotFoundError')
					return null;
				throw e;
			}
		},
		ring() {
			worker.postMessage({ type: 'ring' });
		},
		mainDone() {
			return new Promise<void>((resolve) => {
				mainWake = resolve;
			});
		},
		async statsAsync() {
			const r = await call('stats', {});
			return {
				stats: r.stats!,
				openHandles: r.openHandles ?? 0,
				idleHandles: r.idleHandles ?? 0,
				nodes: r.nodes ?? 0,
			};
		},
	};
	diag('qtclient-fs worker ready');
	return api;
}
