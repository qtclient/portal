/**
 * Shared CIP package layout for desktop dataDir and browser OPFS tip.
 *
 * Desktop / wasm CipSoft root: Qt `QStandardPaths::AppDataLocation` after the
 * tip's org/app names (pack `client.org` / `client.name`; macOS Application
 * Support, Windows %APPDATA%, Linux+WASM XDG).
 *
 * Browser: Emscripten HOME is `/home/web_user` (OPFS-backed tip). CipSoft AppData
 * is the XDG path under that home — same formula as Linux desktop. Packages live
 * under `<CIP_APPDATA>/packages/<name>/…`, not directly under HOME.
 *
 * Before the first Qt module exists there is no Emscripten FS — bootstrap and
 * Play handoff also keep engine binaries in IndexedDB (`<brand>-cip-fs`) with
 * the same relative keys (`packages/LAUNCHER/…`, `packages/<PACKAGE_CLIENT>/…`).
 *
 * CipSoft tip uses directoryname `Tibia.app`; packs override via `client.packageDir`.
 */

import { pack } from '#lib/pack.js';

const BRAND = pack.client;

/** Pack id, or `qtclient` for a stock tip; namespaces browser storage. */
export const BRAND_KEY = BRAND.packId ?? 'qtclient';

/** Tip pack staged under `mods/<id>/` for /play, or null for a stock tip. */
export const CLIENT_PACK_ID = BRAND.packId;

/** Display name of the client (`Loading <name>…`). */
export const CLIENT_NAME = BRAND.name;

/** Emscripten HOME / OPFS tip mount point (not CipSoft AppData). */
export const CIP_HOME = '/home/web_user';

/**
 * CipSoft AppDataLocation mirror for wasm (tip org / app names).
 * Must match Qt `writableLocation(AppDataLocation)` after those names are set.
 */
export const CIP_APPDATA = `${CIP_HOME}/.local/share/${BRAND.org}/${BRAND.name}`;

/** CIP package directory names (match PackageClient / tibiametadata). */
export const PACKAGE_LAUNCHER = 'LAUNCHER';
/**
 * Tip `directoryname` / `packages/<name>/` folder (and package `name`).
 * CipSoft: `Tibia.app`. Packs override with `client.packageDir`.
 */
export const PACKAGE_CLIENT = BRAND.packageDir;

export function packageFsRoot(name: string): string {
	return `${CIP_APPDATA}/packages/${name}`;
}

/**
 * Tip stamp written after sprite packs install. Must match qtclient
 * `LauncherWindow::thingsPacksStampPresent` (`.tibia-sprite-packs`).
 */
export const SPRITE_PACKS_STAMP = '.tibia-sprite-packs';

export function packageIdbKey(packageName: string, localfile: string): string {
	return `packages/${packageName}/${localfile.replace(/^\/+/, '')}`;
}

export const CIP_IDB_NAME = `${BRAND_KEY}-cip-fs`;
export const CIP_IDB_STORE = 'files';
export const CIP_IDB_VERSION = 1;

export type CipIdbFile = {
	key: string;
	packageName: string;
	localfile: string;
	version: string;
	unpackedhash: string;
	bytes: ArrayBuffer;
};

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(CIP_IDB_NAME, CIP_IDB_VERSION);
		req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(CIP_IDB_STORE)) {
				db.createObjectStore(CIP_IDB_STORE, { keyPath: 'key' });
			}
		};
		req.onsuccess = () => resolve(req.result);
	});
}

export async function idbPutFile(file: CipIdbFile): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const tx = db.transaction(CIP_IDB_STORE, 'readwrite');
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? new Error('idb put failed'));
		tx.objectStore(CIP_IDB_STORE).put(file);
	});
	db.close();
}

export async function idbGetFile(
	packageName: string,
	localfile: string,
): Promise<CipIdbFile | undefined> {
	const db = await openDb();
	const key = packageIdbKey(packageName, localfile);
	const row = await new Promise<CipIdbFile | undefined>((resolve, reject) => {
		const tx = db.transaction(CIP_IDB_STORE, 'readonly');
		const req = tx.objectStore(CIP_IDB_STORE).get(key);
		req.onsuccess = () => resolve(req.result as CipIdbFile | undefined);
		req.onerror = () => reject(req.error ?? new Error('idb get failed'));
	});
	db.close();
	return row;
}

export async function idbGetVersion(packageName: string): Promise<string> {
	const row = await idbGetFile(packageName, 'package.json.version');
	if (!row) return '';
	return new TextDecoder().decode(row.bytes).trim();
}

export async function idbPutBytes(
	packageName: string,
	localfile: string,
	version: string,
	unpackedhash: string,
	bytes: Uint8Array,
): Promise<void> {
	const copy = bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
	await idbPutFile({
		key: packageIdbKey(packageName, localfile),
		packageName,
		localfile,
		version,
		unpackedhash,
		bytes: copy,
	});
}

export type BrowserFsLike = {
	mkdirTree(path: string): void;
	writeFile(path: string, data: Uint8Array, opts?: { canOwn?: boolean }): void;
	readFile(path: string): Uint8Array;
	analyzePath(path: string): { exists: boolean };
	isDir(mode: number): boolean;
	stat(path: string): { mode: number };
	readdir(path: string): string[];
};

/** Copy selected files from a mounted Emscripten FS package tree into IndexedDB. */
export async function mirrorFsPackageToIdb(
	fs: BrowserFsLike,
	packageName: string,
	localfiles: string[],
	version: string,
): Promise<number> {
	const root = packageFsRoot(packageName);
	let n = 0;
	for (const localfile of localfiles) {
		const path = `${root}/${localfile}`;
		if (!fs.analyzePath(path).exists) continue;
		const data = fs.readFile(path);
		const hash = await sha256Hex(data);
		await idbPutBytes(packageName, localfile, version, hash, data);
		n += 1;
	}
	return n;
}

/** Write IndexedDB package files into a mounted Emscripten FS tree. */
export async function seedIdbPackageToFs(
	fs: BrowserFsLike,
	packageName: string,
	localfiles: string[],
): Promise<number> {
	const root = packageFsRoot(packageName);
	fs.mkdirTree(root);
	let n = 0;
	for (const localfile of localfiles) {
		const row = await idbGetFile(packageName, localfile);
		if (!row) continue;
		const path = `${root}/${localfile}`;
		const dir = path.slice(0, path.lastIndexOf('/'));
		if (dir) fs.mkdirTree(dir);
		fs.writeFile(path, new Uint8Array(row.bytes), { canOwn: true });
		n += 1;
	}
	return n;
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
