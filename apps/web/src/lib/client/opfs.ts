/**
 * The portal's own OPFS access on /play, before an engine runs: the launcher
 * package install and the engine bytes.
 *
 * Paths are the wasm's: `/home/web_user/<rel>` is OPFS `<rel>`. Once an engine
 * runs, its own qtclient-fs Worker owns OPFS
 * (qtclient browser/qtclient-fs.js); call {@link closeOpfsWriter} before.
 *
 * Reads are File snapshots on the page's thread: they need no access handle,
 * so they work even while another context holds one. Writes need a
 * SyncAccessHandle, which only exists in a dedicated Worker; a small write-only
 * Worker serves them and goes away with closeOpfsWriter.
 */

const HOME = '/home/web_user';

function opfsPath(path: string): string[] {
	if (path !== HOME && !path.startsWith(`${HOME}/`))
		throw new Error(`opfs: path outside ${HOME}: ${path}`);
	return path.slice(HOME.length).split('/').filter(Boolean);
}

async function fileHandle(path: string): Promise<FileSystemFileHandle | null> {
	const parts = opfsPath(path);
	const name = parts.pop();
	if (!name) throw new Error(`opfs: not a file path: ${path}`);
	try {
		let dir = await navigator.storage.getDirectory();
		for (const part of parts) dir = await dir.getDirectoryHandle(part);
		return await dir.getFileHandle(name);
	} catch (e) {
		if (e instanceof DOMException && e.name === 'NotFoundError') return null;
		throw e;
	}
}

/** Whole file, or null when it does not exist. */
export async function readFile(path: string): Promise<Uint8Array | null> {
	const handle = await fileHandle(path);
	if (!handle) return null;
	return new Uint8Array(await (await handle.getFile()).arrayBuffer());
}

// ---- writes ---------------------------------------------------------------------

/** The Worker-only SyncAccessHandle members the writer uses (not in DOM lib). */
type SyncAccessHandle = {
	truncate(size: number): void;
	write(data: Uint8Array, options: { at: number }): number;
	close(): void;
};
type SyncFileHandle = { createSyncAccessHandle(): Promise<SyncAccessHandle> };

// Write-only Worker: create parents, take the access handle (waiting briefly
// for one a just-closed /play document still holds), replace the contents.
function writerMain(): void {
	const LOCK_WAIT_MS = 4000;
	async function write(parts: string[], data: ArrayBuffer): Promise<void> {
		const name = parts.pop() as string;
		let dir = await navigator.storage.getDirectory();
		for (const part of parts)
			dir = await dir.getDirectoryHandle(part, { create: true });
		const file = await dir.getFileHandle(name, { create: true });
		const t0 = performance.now();
		for (let delay = 10; ; delay = Math.min(delay * 2, 250)) {
			let sah: SyncAccessHandle;
			try {
				sah = await (
					file as unknown as SyncFileHandle
				).createSyncAccessHandle();
			} catch (e) {
				const locked =
					e instanceof DOMException &&
					(e.name === 'NoModificationAllowedError' ||
						e.name === 'InvalidStateError');
				if (!locked || performance.now() - t0 > LOCK_WAIT_MS) throw e;
				await new Promise((r) => setTimeout(r, delay));
				continue;
			}
			try {
				const bytes = new Uint8Array(data);
				sah.truncate(0);
				const n = bytes.byteLength ? sah.write(bytes, { at: 0 }) : 0;
				if (n !== bytes.byteLength)
					throw new Error(`short write: ${n} of ${bytes.byteLength} bytes`);
			} finally {
				sah.close();
			}
			return;
		}
	}
	self.onmessage = (ev: MessageEvent) => {
		const { id, parts, data } = ev.data as {
			id: number;
			parts: string[];
			data: ArrayBuffer;
		};
		write(parts, data).then(
			() => self.postMessage({ id, ok: true }),
			(e: unknown) =>
				self.postMessage({
					id,
					ok: false,
					error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
				}),
		);
	};
}

let writer: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (r: { ok: boolean; error?: string }) => void>();

function writerWorker(): Worker {
	if (writer) return writer;
	const url = URL.createObjectURL(
		new Blob([`(${writerMain.toString()})();`], { type: 'text/javascript' }),
	);
	writer = new Worker(url, { name: 'portal-opfs-writer' });
	URL.revokeObjectURL(url);
	writer.onmessage = (
		ev: MessageEvent<{ id: number; ok: boolean; error?: string }>,
	) => {
		const done = pending.get(ev.data.id);
		pending.delete(ev.data.id);
		done?.(ev.data);
	};
	return writer;
}

/** Create or replace a whole file (parents created). */
export async function writeFile(path: string, data: Uint8Array): Promise<void> {
	const parts = opfsPath(path);
	// Own copy, transferred: the caller's buffer stays usable.
	const copy = data.slice().buffer;
	const id = nextId++;
	const r = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
		pending.set(id, resolve);
		writerWorker().postMessage({ id, parts, data: copy }, [copy]);
	});
	if (!r.ok) throw new Error(`opfs write ${path}: ${r.error}`);
}

/** End the writer before an engine's qtclient-fs Worker takes over OPFS. */
export function closeOpfsWriter(): void {
	writer?.terminate();
	writer = null;
	for (const done of pending.values())
		done({ ok: false, error: 'writer closed' });
	pending.clear();
}
