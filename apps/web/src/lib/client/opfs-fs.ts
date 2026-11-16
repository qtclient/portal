/**
 * Origin Private File System = durable tip disk for browser (soft + game).
 *
 * Soft and game both use Module.qtclientFs (Worker + SAB) + Qt file engine for
 * `/home/web_user`, `/mods`, and `/data`. Tip MEMFS hydrate is not used.
 * Files open lazily (SyncAccessHandle LRU); wasm JSPI yields for Safari.
 *
 * Layout (see qtclient-fs/paths.ts):
 *   `/home/web_user/<rel>` ↔ OPFS `<rel>`
 *   `/mods/<rel>` ↔ OPFS `mods/<rel>`
 *   `/data/<rel>` ↔ OPFS `data/<rel>`
 */
import {
	BRAND_KEY,
	CIP_APPDATA,
	CIP_HOME,
	PACKAGE_CLIENT,
	SPRITE_PACKS_STAMP,
	packageFsRoot,
} from './cip-fs.js';
import { diag, diagFlush, diagWarn } from './play-diag.js';
import {
	absQtclientFsPath,
	isQtclientFsPath,
	opfsRelFromQtclientAbs,
} from './qtclient-fs/paths.js';
import { QtclientFsOpen } from './qtclient-fs/protocol.js';
import {
	releaseQtclientFsHandlesForPortalWrites,
	type QtclientFsSyncApi,
} from './qtclient-fs/sync-bridge.js';

function liveQtclientFs(): QtclientFsSyncApi | null {
	const g = globalThis as unknown as { qtclientFs?: QtclientFsSyncApi };
	const tip = g.qtclientFs;
	return tip?.ready ? tip : null;
}

/**
 * Prefer qtclient-fs writes (same path QFile uses). One-shot writeFileAsync when
 * available — concurrent across paths. Chunked open/write/close is fallback.
 */
async function writeViaQtclientFs(
	tip: QtclientFsSyncApi,
	absPath: string,
	data: Uint8Array,
): Promise<void> {
	if (typeof tip.writeFileAsync === 'function') {
		const rc = await tip.writeFileAsync(absPath, data);
		if (rc < 0) throw new Error(`qtclient-fs putFile failed (${rc}): ${absPath}`);
		return;
	}
	const flags =
		QtclientFsOpen.Write | QtclientFsOpen.Create | QtclientFsOpen.Truncate;
	const fd = tip.openAsync
		? await tip.openAsync(absPath, flags)
		: tip.open(absPath, flags);
	if (fd < 0) throw new Error(`qtclient-fs open failed (${fd}): ${absPath}`);
	try {
		let off = 0;
		while (off < data.byteLength) {
			const chunk = data.subarray(off, off + Math.min(data.byteLength - off, 1 << 20));
			const n = tip.writeAsync
				? await tip.writeAsync(fd, chunk)
				: tip.write(fd, chunk);
			if (n <= 0) throw new Error(`qtclient-fs write failed (${n}): ${absPath}`);
			off += n;
		}
		if (tip.flushAsync) await tip.flushAsync(fd);
		else tip.flush(fd);
	} finally {
		if (tip.closeAsync) await tip.closeAsync(fd);
		else tip.close(fd);
	}
}

/** Durable tip pack cache (mods/<packId>) keyed by engine tip stamp. */
export const PACK_CACHE_ROOT = `${CIP_APPDATA}/.${BRAND_KEY}-web-pack`;

export type OpfsBrowserFs = {
	mkdirTree(path: string): void;
	readdir(path: string): string[];
	analyzePath(path: string): { exists: boolean };
	unlink(path: string): void;
	writeFile(path: string, data: Uint8Array, opts?: { canOwn?: boolean }): void;
	lookupPath?(path: string): {
		node?: { contents?: unknown; usedBytes?: number };
	};
};

type ModuleFlag = {
	qtclientPersistentFsMounted?: boolean;
	qtclientWasmfsOpfs?: boolean | number;
	/**
	 * Portal prepared qtclient-fs before callMain. tibia.wasm skips remounting
	 * /home/web_user (memory remount would hide AppData).
	 */
	qtclientPortalHydratedTip?: boolean | number;
	/** Portal prepared durable FS roots (flag). API object is Module.qtclientFs. */
	qtclientFsReady?: boolean | number;
	FS?: OpfsBrowserFs;
};

/** After handoff, portal must not write tip paths (wasm owns OPFS). */
let tipFrozenForWasm = false;

/** In-flight main-thread createWritable writers — must finish before qtclient-fs sync opens. */
const pendingOpfsWrites = new Set<Promise<void>>();

function trackOpfsWrite(p: Promise<void>): Promise<void> {
	pendingOpfsWrites.add(p);
	void p.finally(() => pendingOpfsWrites.delete(p));
	return p;
}

/**
 * Await every portal OPFS createWritable. Safari deadlocks if qtclient-fs
 * createSyncAccessHandle runs while a WritableFileStream still holds the file.
 */
export async function flushOpfsWrites(): Promise<void> {
	const batch = [...pendingOpfsWrites];
	if (batch.length === 0) return;
	diag('OPFS flush pending writers', { n: batch.length });
	await Promise.all(batch);
}

export type FreezeTipOpts = {
	soft?: boolean;
	onStatus?: (text: string, progress: number) => void;
};

/**
 * Call once tip is verified and callMain is about to run.
 * Flush portal createWritable locks only — qtclient-fs opens lazily via JSPI
 * (no preopen of the whole tip).
 */
export async function freezeTipForWasmHandoff(
	opts?: FreezeTipOpts,
): Promise<void> {
	void opts;
	await flushOpfsWrites();
	tipFrozenForWasm = true;
}

export function tipOwnedByWasm(): boolean {
	return tipFrozenForWasm;
}

function absUnderHome(path: string): string {
	return absQtclientFsPath(path);
}

/** VFS qtclient-fs absolute → OPFS relative (origin root). */
function opfsRelFromAbs(absPath: string): string {
	return opfsRelFromQtclientAbs(absPath);
}

async function originOpfsRoot(): Promise<FileSystemDirectoryHandle> {
	return navigator.storage.getDirectory();
}

async function ensureOpfsDir(
	root: FileSystemDirectoryHandle,
	relDir: string,
): Promise<FileSystemDirectoryHandle> {
	if (!relDir) return root;
	let cur = root;
	for (const part of relDir.split('/').filter(Boolean)) {
		cur = await cur.getDirectoryHandle(part, { create: true });
	}
	return cur;
}

async function resolveOpfsParent(
	root: FileSystemDirectoryHandle,
	absPath: string,
): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
	const rel = opfsRelFromAbs(absPath);
	const parts = rel.split('/').filter(Boolean);
	const name = parts.pop();
	if (!name) throw new Error(`OPFS invalid file path ${absPath}`);
	const dir = await ensureOpfsDir(root, parts.join('/'));
	return { dir, name };
}

export async function opfsThingsStampMatches(rev: string): Promise<boolean> {
	const want = rev.trim();
	if (!want) return false;
	const stampAbs = `${packageFsRoot(PACKAGE_CLIENT)}/${SPRITE_PACKS_STAMP}`;
	try {
		const root = await originOpfsRoot();
		const { dir, name } = await resolveOpfsParent(root, stampAbs);
		const fh = await dir.getFileHandle(name);
		const file = await fh.getFile();
		return (await file.text()).trim() === want;
	} catch {
		return false;
	}
}

/** Serialize main-thread OPFS writers — Safari InvalidStateError under concurrency. */
let opfsWriteChain: Promise<void> = Promise.resolve();

function isOpfsLockError(err: unknown): boolean {
	const name = err instanceof DOMException ? err.name : '';
	const msg = err instanceof Error ? err.message : String(err);
	return (
		name === 'InvalidStateError' ||
		name === 'NoModificationAllowedError' ||
		/invalid state|not allowed|cannot be found/i.test(msg)
	);
}

async function writeOpfsFileOnce(
	absPath: string,
	data: Uint8Array,
): Promise<void> {
	const root = await originOpfsRoot();
	const { dir, name } = await resolveOpfsParent(root, absPath);
	const fh = await dir.getFileHandle(name, { create: true });
	// keepExistingData:false avoids Safari locks on truncate-replace.
	const w = await fh.createWritable({ keepExistingData: false });
	try {
		const copy = new Uint8Array(data.byteLength);
		copy.set(data);
		await w.write(copy);
	} finally {
		await w.close();
	}
}

export async function writeOpfsFile(
	absPath: string,
	data: Uint8Array,
): Promise<void> {
	const run = (async () => {
		const prev = opfsWriteChain;
		let release!: () => void;
		opfsWriteChain = new Promise<void>((r) => {
			release = r;
		});
		await prev.catch(() => {});
		try {
			const tip = liveQtclientFs();
			if (tip) {
				await writeViaQtclientFs(tip, absPath, data);
				return;
			}
			let last: unknown;
			for (let attempt = 0; attempt < 6; attempt++) {
				try {
					if (attempt > 0) await releaseQtclientFsHandlesForPortalWrites();
					await writeOpfsFileOnce(absPath, data);
					return;
				} catch (err) {
					last = err;
					if (!isOpfsLockError(err) || attempt === 5) throw err;
					await new Promise((r) =>
						setTimeout(r, 40 * (attempt + 1) * (attempt + 1)),
					);
				}
			}
			throw last;
		} finally {
			release();
		}
	})();
	return trackOpfsWrite(run);
}

export async function writePersistentFile(
	_fs: OpfsBrowserFs,
	absPath: string,
	data: Uint8Array,
): Promise<void> {
	void _fs;
	const abs = absUnderHome(absPath);
	// After freeze, portal still installs packs/stamps via Module.qtclientFs (same
	// SyncAccessHandle path as QFile). Only refuse when qtclient-fs is gone — then
	// createWritable would race wasm handles.
	if (tipFrozenForWasm && !liveQtclientFs()) {
		throw new Error(
			`tip owned by wasm — refused portal write under qtclient-fs: ${abs}`,
		);
	}
	await writeOpfsFile(abs, data);
}

async function bytesFromBlob(blob: Blob): Promise<Uint8Array> {
	return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Soft + game: scaffold memory FS for non-tip paths + OPFS write-through.
 * Durable tip/mods/data stay on OPFS; Module.qtclientFs + Qt file engine serve QFile.
 */
export async function prepareQtclientFsHome(
	fs: OpfsBrowserFs,
	onStatus?: (text: string, progress: number) => void,
): Promise<void> {
	if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
		throw new Error('OPFS unavailable — Play requires durable tip storage');
	}
	tipFrozenForWasm = false;
	onStatus?.('Preparing…', 80);
	// Memory scaffold only — real bytes are OPFS via qtclientFs / writeOpfsFile.
	for (const p of [CIP_HOME, CIP_APPDATA, `${CIP_APPDATA}/packages`, '/mods', '/data']) {
		try {
			fs.mkdirTree(p);
		} catch {
			/* WasmFS may already have the node */
		}
	}
	installWriteThrough(fs);
	const mod = globalThis as unknown as ModuleFlag;
	mod.qtclientPersistentFsMounted = true;
	mod.qtclientWasmfsOpfs = 0;
	mod.qtclientPortalHydratedTip = 1;
	mod.qtclientFsReady = 1;
	mod.FS = fs;
	diagFlush('qtclient-fs ready (unified OPFS)', {
		home: CIP_HOME,
		mods: '/mods',
		data: '/data',
	});
}

function installWriteThrough(fs: OpfsBrowserFs): void {
	const orig = fs.writeFile.bind(fs);
	fs.writeFile = (
		path: string,
		data: Uint8Array,
		opts?: { canOwn?: boolean },
	) => {
		orig(path, data, opts);
		if (!isQtclientFsPath(path)) return;
		// Tracked — freezeTipForWasmHandoff awaits these before sync qtclient-fs opens.
		void writeOpfsFile(path, data).catch((err) => {
			diagWarn('OPFS write-through failed', {
				path,
				err: err instanceof Error ? err.message : String(err),
			});
		});
	};
}

export async function readOpfsText(absPath: string): Promise<string | null> {
	try {
		const root = await originOpfsRoot();
		const { dir, name } = await resolveOpfsParent(root, absPath);
		const fh = await dir.getFileHandle(name);
		return await (await fh.getFile()).text();
	} catch {
		return null;
	}
}

export async function opfsPackCacheStampMatches(
	stamp: string,
): Promise<boolean> {
	const want = stamp.trim();
	if (!want) return false;
	const got = await readOpfsText(`${PACK_CACHE_ROOT}/.stamp`);
	return (got ?? '').trim() === want;
}

export async function listOpfsFiles(
	absDir: string,
): Promise<Array<{ rel: string; abs: string }>> {
	const out: Array<{ rel: string; abs: string }> = [];
	try {
		const root = await originOpfsRoot();
		const relDir = opfsRelFromAbs(absDir);
		const dir = await ensureOpfsDir(root, relDir);
		async function walk(
			handle: FileSystemDirectoryHandle,
			prefix: string,
		): Promise<void> {
			for await (const [name, h] of (
				handle as FileSystemDirectoryHandle & {
					entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
				}
			).entries()) {
				const rel = prefix ? `${prefix}/${name}` : name;
				if (h.kind === 'directory') {
					await walk(h as FileSystemDirectoryHandle, rel);
				} else if (name !== '.stamp') {
					out.push({ rel, abs: `${absDir.replace(/\/+$/, '')}/${rel}` });
				}
			}
		}
		await walk(dir, '');
	} catch {
		/* empty */
	}
	return out;
}

export async function readOpfsBytes(
	absPath: string,
): Promise<Uint8Array | null> {
	try {
		const root = await originOpfsRoot();
		const { dir, name } = await resolveOpfsParent(root, absPath);
		const fh = await dir.getFileHandle(name);
		return await bytesFromBlob(await fh.getFile());
	} catch {
		return null;
	}
}

export async function opfsPathExists(absPath: string): Promise<boolean> {
	try {
		const root = await originOpfsRoot();
		const { dir, name } = await resolveOpfsParent(root, absPath);
		await dir.getFileHandle(name);
		return true;
	} catch {
		return false;
	}
}

export async function opfsFileSize(absPath: string): Promise<number | null> {
	try {
		const root = await originOpfsRoot();
		const { dir, name } = await resolveOpfsParent(root, absPath);
		const fh = await dir.getFileHandle(name);
		return (await fh.getFile()).size;
	} catch {
		return null;
	}
}

/** True when tip OPFS already holds at least one sprite sheet. */
export async function opfsHasSpriteSheets(
	packageRoot: string,
): Promise<boolean> {
	const dirs = [
		`${packageRoot}/Contents/Resources/assets`,
		`${packageRoot}/Contents/Resources`,
	];
	try {
		const root = await originOpfsRoot();
		for (const dirAbs of dirs) {
			try {
				const rel = opfsRelFromAbs(dirAbs);
				const dir = await ensureOpfsDir(root, rel);
				for await (const [name, handle] of (
					dir as FileSystemDirectoryHandle & {
						entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
					}
				).entries()) {
					if (handle.kind !== 'file') continue;
					if (name.toLowerCase().includes('sprites-')) return true;
				}
			} catch {
				/* try next */
			}
		}
	} catch {
		return false;
	}
	return false;
}

/** True when tip OPFS holds CipSoft minimap colour tiles. */
export async function opfsHasMinimapTiles(
	packageRoot: string,
): Promise<boolean> {
	const dirs = [
		`${packageRoot}/Contents/Resources/minimap`,
		`${packageRoot}/Contents/Resources/assets/minimap`,
	];
	try {
		const root = await originOpfsRoot();
		for (const dirAbs of dirs) {
			try {
				const rel = opfsRelFromAbs(dirAbs);
				const dir = await ensureOpfsDir(root, rel);
				for await (const [name, handle] of (
					dir as FileSystemDirectoryHandle & {
						entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
					}
				).entries()) {
					if (handle.kind !== 'file') continue;
					if (name.startsWith('Minimap_Color_')) return true;
				}
			} catch {
				/* try next */
			}
		}
	} catch {
		return false;
	}
	return false;
}

export { packageFsRoot, PACKAGE_CLIENT };
