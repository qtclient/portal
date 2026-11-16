/**
 * Browser boot for the Qt/QML tibia engine (Phase 6 /play cutover).
 * Loads tibia.js + qtloader into the /play document (no iframe), mounts the
 * launcher-synced things tree into MEMFS (same as Lua OTC), then starts main.
 */
import { unzipSync } from 'fflate';

import {
	type BrowserFsLike,
	BRAND_KEY,
	CIP_APPDATA,
	CIP_HOME,
	CLIENT_NAME,
	CLIENT_PACK_ID,
	PACKAGE_CLIENT,
	PACKAGE_LAUNCHER,
	packageFsRoot,
	seedIdbPackageToFs,
	SPRITE_PACKS_STAMP,
} from './cip-fs.js';
import {
	blobUrlForBytes,
	ensurePackageInIdb,
	type PackageProgress,
	requireIdbFile,
} from './cip-package.js';
import {
	listOpfsFiles,
	opfsFileSize,
	opfsHasMinimapTiles,
	opfsHasSpriteSheets,
	opfsPackCacheStampMatches,
	opfsPathExists,
	opfsThingsStampMatches,
	PACK_CACHE_ROOT,
	prepareQtclientFsHome,
	readOpfsBytes,
	readOpfsText,
	freezeTipForWasmHandoff,
	writeOpfsFile,
	writePersistentFile,
} from './opfs-fs.js';
import { createListenerBag } from './otc/dom-util';
import {
	clearOtcRemountCount,
	OTC_SCRIPT_ATTR,
	otcWasmAlreadyLoaded,
	reloadForOtcRemount,
} from './otc/wasm-guard';
import { diag, diagFlush, diagWarn } from './play-diag';
import {
	attachQtclientFsToModule,
	createQtclientFsSyncBridge,
	releaseQtclientFsHandlesForPortalWrites,
	type QtclientFsSyncApi,
} from './qtclient-fs/index.js';
import { reportBrowserCrash } from './crash-report';
import { attachViewMagnify } from './view-magnify';
import { playEnv } from '$pack/play.client';

export { PACKAGE_CLIENT, PACKAGE_LAUNCHER } from './cip-fs.js';
export { requireIdbFile } from './cip-package.js';

/** Default tip directoryname root (`packages/${PACKAGE_CLIENT}`). Launcher may override. */
const PACKAGE_ROOT = packageFsRoot(PACKAGE_CLIENT);

/**
 * sessionStorage: qtclient Play → game remount (Emscripten cannot re-init in-page).
 * Must match LauncherWindow::play() EM_ASM keys.
 */
export const PLAY_HANDOFF_KEY = 'tibia.play';
/** Keep the launching overlay across the remount navigation. */
export const PLAY_TRANSITION_KEY = 'tibia.play.transition';

/** Engine files under packages/<PACKAGE_CLIENT> (mirrored to IndexedDB for Play). */
export const TIBIA_ENGINE_FILES = [
	'tibia.js',
	'tibia.wasm',
	'tibia.data',
	'qtloader.js',
	'package.json',
	'package.json.version',
] as const;

export const LAUNCHER_ENGINE_FILES = [
	'launcher.js',
	'launcher.wasm',
	'qtloader.js',
	'package.json',
	'package.json.version',
] as const;

export type TibiaBootOptions = {
	/**
	 * Tip dir with engine bytes + qtloader.js.
	 * qtclient: launcher.{js,wasm}; game: tibia.{js,wasm,data?}.
	 */
	wasmBase: string;
	revision: string;
	/**
	 * qtclient assemble tip that carries mods/<pack> (release.json targets.web.wasm).
	 * Engine package may live under launcher/tibiaclient-web-current without the pack.
	 */
	packWasmBase?: string;
	/** Busts the browser engine cache after a local wasm rebuild. */
	engineStamp?: string;
	assetBase: string;
	/**
	 * Which IDB tip / Emscripten entry to boot.
	 * qtclient chrome = `launcher` (Widgets-only); game = `tibia` (QML).
	 */
	engine?: 'launcher' | 'tibia';
	/**
	 * qtclient Play remount or warm InstalledAndUsable tip: skip qtclient Widgets,
	 * boot game UI only (`QTCLIENT_WASM_SKIP_LAUNCHER=1`). Only for `engine: 'tibia'`.
	 */
	skipLauncher?: boolean;
	/** IndexedDB engine copy (tibia.js/wasm). Tip AppData is OPFS. */
	store?: { writeToFS(fs: BrowserFs, root?: string): Promise<number> };
	onStatus?: (text: string, progress: number) => void;
	/** WASM Module onLoaded — may fire before tip page-in / callMain. */
	onReady?: () => void;
	/**
	 * Soft launcher: entryFunction finished (essentials + pack staged, callMain next).
	 * Prefer this over onReady to drop the portal overlay.
	 */
	onLauncherReady?: () => void;
	/**
	 * Game-only: login UI is up (C++ `__qtclientGameUiReady`, or print fallback).
	 * Do **not** wait for `qtLoad` to resolve — under JSPI `main` stays in
	 * `application.exec` so that promise never settles.
	 */
	onGameReady?: () => void;
	onError?: (message: string) => void;
	onFatal?: (message: string) => void;
};

export type TibiaBootHandle = {
	destroy: () => void;
};

const GAME_CHORDS = [
	'KeyW',
	'KeyA',
	'KeyS',
	'KeyD',
	'ArrowUp',
	'ArrowDown',
	'ArrowLeft',
	'ArrowRight',
	'Home',
	'End',
	'PageUp',
	'PageDown',
];

type KeyboardLock = {
	lock?: (keys: string[]) => Promise<void>;
	unlock?: () => void;
};

function keyboardLock(): KeyboardLock | undefined {
	return (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard;
}

/** Qt WebGL enables WEBGL_polygon_mode; browsers warn once per context — CipSoft noise. */
function quietWebGlPolygonModeWarn(): void {
	if (typeof console === 'undefined' || typeof console.warn !== 'function')
		return;
	const key = '__qtclientQuietWebGlPolygonMode';
	const g = globalThis as typeof globalThis & { [key]?: boolean };
	if (g[key]) return;
	g[key] = true;
	const orig = console.warn.bind(console);
	console.warn = (...args: unknown[]) => {
		const text = args.map(String).join(' ');
		if (text.includes('WEBGL_polygon_mode')) return;
		orig(...args);
	};
}

/** Qt's wasm keyboard sink is a 1px hidden field. A real page input is visible. */
function isVisibleField(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el || el.nodeType !== 1) return false;
	const tag = el.tagName;
	if (
		tag !== 'INPUT' &&
		tag !== 'TEXTAREA' &&
		tag !== 'SELECT' &&
		!el.isContentEditable
	)
		return false;
	const style = getComputedStyle(el);
	if (
		style.opacity === '0' ||
		style.visibility === 'hidden' ||
		style.display === 'none'
	)
		return false;
	const rect = el.getBoundingClientRect();
	return rect.width >= 8 && rect.height >= 8;
}

/**
 * While JavaScript fullscreen is active, ask the browser to hand game chords
 * to the page. Chrome exposes navigator.keyboard.lock(); Safari 26.4+ takes
 * keyboardLock on requestFullscreen(). Neither works outside fullscreen.
 */
export function installGameKeyGuard(): () => void {
	let locked = false;
	let requestedWithLock = false;
	// Monkey-patch fullscreen so we can request keyboard lock with the element as `this`.
	// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional extract + .call(this)
	const original = Element.prototype.requestFullscreen;
	Element.prototype.requestFullscreen = function (this: Element, options) {
		requestedWithLock = true;
		const withLock = { ...(options ?? {}), keyboardLock: 'browser' };
		return original.call(this, withLock as FullscreenOptions).then(
			(value) => value,
			(error: unknown) => {
				if (!document.fullscreenElement) requestedWithLock = false;
				throw error;
			},
		);
	};

	const syncLock = () => {
		if (!document.fullscreenElement) {
			locked = false;
			requestedWithLock = false;
			keyboardLock()?.unlock?.();
			return;
		}
		const keyboard = keyboardLock();
		if (!keyboard?.lock) {
			locked = requestedWithLock;
			return;
		}
		void keyboard.lock(GAME_CHORDS).then(
			() => {
				locked = true;
			},
			() => {
				locked = false;
			},
		);
	};

	const onKey = (event: KeyboardEvent) => {
		if (!locked || !document.fullscreenElement) return;
		if (!document.getElementById('tibia-screen')) return;
		if (!event.metaKey && !event.ctrlKey) return;
		if (!GAME_CHORDS.includes(event.code)) return;
		if (isVisibleField(event.target)) return;
		event.preventDefault();
	};

	document.addEventListener('fullscreenchange', syncLock);
	window.addEventListener('keydown', onKey, true);
	syncLock();
	return () => {
		Element.prototype.requestFullscreen = original;
		document.removeEventListener('fullscreenchange', syncLock);
		window.removeEventListener('keydown', onKey, true);
		keyboardLock()?.unlock?.();
		locked = false;
	};
}

type TibiaModule = {
	FS: BrowserFs;
	ENV?: Record<string, string>;
	callMain: (args?: string[]) => void;
	qtclientPersistentFsMounted?: boolean;
	qtclientFsReady?: boolean | number;
	qtclientFs?: QtclientFsSyncApi;
};

type BrowserFs = {
	mkdirTree(path: string): void;
	readdir(path: string): string[];
	stat(path: string): { mode: number };
	/** Classic MEMFS only — WasmFS omits this; use `fsIsDir` instead. */
	isDir?(mode: number): boolean;
	/** Emscripten MEMFS — true for symlink nodes (do not recurse through these). */
	isLink?(mode: number): boolean;
	readFile(path: string): Uint8Array;
	writeFile(path: string, data: Uint8Array, opts?: { canOwn?: boolean }): void;
	unlink(path: string): void;
	rmdir?(path: string): void;
	analyzePath(path: string): { exists: boolean };
	/** Emscripten MEMFS — cheap play-path expose without cloning sprite bytes. */
	symlink?(oldpath: string, newpath: string): void;
};

/** Directory check that works on classic MEMFS and WasmFS (no `FS.isDir`). */
function fsIsDir(fs: BrowserFs, path: string): boolean {
	if (typeof fs.isDir === 'function') {
		try {
			return fs.isDir(fs.stat(path).mode);
		} catch {
			return false;
		}
	}
	try {
		fs.readdir(path);
		return true;
	} catch {
		return false;
	}
}

/**
 * Scaffold tip/mods/data MEMFS + OPFS write-through — no qtclient-fs Worker yet.
 * Pack/sync must finish before SyncAccessHandles exist (Safari createWritable).
 */
async function prepareBrowserTipScaffold(
	instance: { FS: BrowserFs },
	onStatus?: (text: string, progress: number) => void,
): Promise<void> {
	await prepareQtclientFsHome(instance.FS, onStatus);
	(instance as TibiaModule).qtclientPersistentFsMounted = true;
}

/**
 * Soft + game: Module.qtclientFs (Worker+SAB) + Qt file engine for tip/mods/data.
 * Mount early so portal staging writes via SyncAccessHandle (Safari
 * createWritable is lock-fragile). Files still open lazily on demand.
 */
async function mountQtclientFsBridge(instance: {
	FS: BrowserFs;
}): Promise<{ qtclientFs: true }> {
	const bridge = await createQtclientFsSyncBridge();
	if (!bridge) {
		throw new Error(
			`qtclient-fs unavailable (crossOriginIsolated=${!!(
				globalThis as { crossOriginIsolated?: boolean }
			).crossOriginIsolated}, SharedArrayBuffer=${typeof SharedArrayBuffer !== 'undefined'})`,
		);
	}
	attachQtclientFsToModule(instance as TibiaModule, bridge);
	(instance as TibiaModule).qtclientPersistentFsMounted = true;
	diag('qtclient-fs mount ok', { home: CIP_HOME, mods: '/mods', data: '/data' });
	return { qtclientFs: true };
}

type QtLoadConfig = {
	locateFile?: (path: string) => string;
	/**
	 * Emscripten pthread Workers call `new Worker(scriptUrl)`. Prefer a Blob of
	 * tibia.js (same-origin) or a same-origin `/play/em-pthread/…` URL string.
	 * Avoid leaving a cross-origin tip URL here — Classic Workers reject it
	 * even with CORS.
	 */
	mainScriptUrlOrBlob?: string | Blob;
	monitorRunDependencies?: (left: number) => void;
	/**
	 * Prefer this over `qt.module`: qtloader's async instantiateWasm returns a
	 * Promise that deadlocks createWasm (runDeps stuck on wasm-instantiate).
	 */
	instantiateWasm?: (
		imports: WebAssembly.Imports,
		receiveInstance: (
			instance: WebAssembly.Instance,
			module: WebAssembly.Module,
		) => void,
	) => void;
	/**
	 * Optional Emscripten `Module.canvas`. Game Qt paints into
	 * `containerElements` on the browser main thread (JSPI); soft leaves unset.
	 */
	canvas?: HTMLCanvasElement;
	qt: {
		entryFunction: (config: unknown) => Promise<TibiaModule>;
		containerElements: HTMLElement[];
		environment?: Record<string, string>;
		/** Compiled engine. Skips emscripten's own fetch of tibia.wasm. */
		module?: WebAssembly.Module | Promise<WebAssembly.Module>;
		onLoaded?: () => void;
		onExit?: (exit: {
			text?: string;
			code?: number;
			crashed?: boolean;
		}) => void;
	};
};

function isCrossOriginUrl(url: string): boolean {
	try {
		return new URL(url, location.href).origin !== location.origin;
	} catch {
		return false;
	}
}

/**
 * Join tip CDN + relative path (production: your static host; local: :9080).
 */
export function tipUrl(assetCdn: string, tipRel: string): string {
	const tip = tipRel.replace(/^\/+/, '').replace(/\/+$/, '');
	const cdn = assetCdn.replace(/\/+$/, '');
	if (!cdn) throw new Error('tipUrl requires an absolute CDN origin');
	return `${cdn}/${tip}`;
}

/**
 * Same-origin COEP URL for tip engine JS (launcher.js / tibia.js).
 *
 * Dev: `/play/engine/{tibia,launcher}/…` is a Vite static middleware over the
 * local tip (bare-tibia.html shape — Workers must not go through the async
 * SvelteKit em-pthread proxy). Prod: `/play/em-pthread/{name}` tip proxy.
 */
export function pthreadMainScriptUrl(
	engineMainJsUrl: string,
): string | undefined {
	if (!isCrossOriginUrl(engineMainJsUrl)) return undefined;
	try {
		const u = new URL(engineMainJsUrl, location.href);
		const base = u.pathname.split('/').pop() ?? '';
		if (base !== 'launcher.js' && base !== 'tibia.js') return undefined;
		const stamp = u.search || '';
		const kind = base === 'launcher.js' ? 'launcher' : 'tibia';
		const host = location.hostname;
		if (host === 'localhost' || host === '127.0.0.1') {
			return `/play/engine/${kind}/${base}${stamp}`;
		}
		return `/play/em-pthread/${base}${stamp}`;
	} catch {
		/* ignore */
	}
	return undefined;
}

/**
 * Same-origin dir for pthread Worker JS only (`/play/em-pthread` or
 * `/play/engine/{tibia,launcher}`). Prod em-pthread proxies JS alone —
 * `.wasm` / `.data` must stay on the tip CDN (CORP: cross-origin).
 */
export function sameOriginEngineDir(
	engineMainJsUrl: string,
): string | undefined {
	const pthread = pthreadMainScriptUrl(engineMainJsUrl);
	if (!pthread) return undefined;
	return pthread.replace(/\/[^/?#]+(?:\?.*)?$/, '');
}

/**
 * qtclient `dataDirs()` always probes `/data` for graphics_resources.rcc + fonts.
 * Tip things land under Contents/Resources/assets — dual-write the small boot set
 * onto durable qtclient-fs `/data` (OPFS). Do not mirror sprite packs (OOM).
 */
function writeQtclientBootMirror(
	fs: BrowserFs,
	path: string,
	data: Uint8Array,
): void {
	const lower = path.toLowerCase();
	let dest: string | null = null;
	if (
		lower.endsWith('/graphics_resources.rcc') ||
		lower === 'graphics_resources.rcc'
	) {
		dest = '/data/graphics_resources.rcc';
	} else {
		const font = path.match(/^\/data\/fonts\/(.+)$/i);
		if (font) dest = `/data/fonts/${font[1]}`;
	}
	if (!dest) return;
	void fs;
	// Awaited via freezeTipForWasmHandoff → flushOpfsWrites (tracked promise).
	void writeOpfsFile(dest, data).catch((err) => {
		diagWarn('boot mirror OPFS write failed', {
			dest,
			err: err instanceof Error ? err.message : String(err),
		});
	});
}

/** Copy qtclient boot mirrors from tip OPFS into `/data` (also qtclient-fs). */
async function ensureQtclientBootAssetsFromPackage(
	_fs: BrowserFs,
	packageRoot: string,
): Promise<void> {
	void _fs;
	const copyIfMissing = async (src: string, dest: string): Promise<boolean> => {
		if (!(await opfsPathExists(src))) return false;
		if (await opfsPathExists(dest)) return false;
		try {
			const data = await readOpfsBytes(src);
			if (!data) return false;
			await writeOpfsFile(dest, data);
			return true;
		} catch {
			return false;
		}
	};
	let rcc = 0;
	let fonts = 0;
	let spells = 0;
	// CIP assets.json ships RCC at Contents/MacOS/; qtclient also probes
	// Contents/Resources/assets and /data (writeQtclientBootMirror).
	for (const src of [
		`${packageRoot}/Contents/MacOS/graphics_resources.rcc`,
		`${packageRoot}/Contents/Resources/assets/graphics_resources.rcc`,
	]) {
		if (await copyIfMissing(src, '/data/graphics_resources.rcc')) {
			rcc = 1;
			break;
		}
	}
	const fontsDir = `${packageRoot}/Contents/Resources/assets/fonts`;
	for (const face of [
		'Verdana.ttf',
		'Verdana-Bold.ttf',
		'Verdana-Italic.ttf',
		'Verdana-Bold-Italic.ttf',
	]) {
		if (await copyIfMissing(`${fontsDir}/${face}`, `/data/fonts/${face}`))
			fonts += 1;
	}
	const tipAssets = `${packageRoot}/Contents/Resources/assets`;
	for (const name of ['spells.json', 'spells-previews.json']) {
		if (await copyIfMissing(`${tipAssets}/${name}`, `/data/${name}`))
			spells += 1;
	}
	if (rcc || fonts || spells)
		diag('ensureQtclientBootAssetsFromPackage', {
			rcc,
			fonts,
			spells,
			packageRoot,
		});
}

/**
 * Tip things list may omit Magical Archive previews until the next assets
 * publish. Pull `extras/spells-previews.json` (and ensure spells.json) into the
 * tip package + `/data/` so spellsAssetPath finds them on /play.
 */
async function ensureSpellsExtrasFromCdn(
	fs: BrowserFs,
	packageRoot: string,
	cdn: string,
): Promise<void> {
	const base = cdn.replace(/\/+$/, '');
	const tipAssets = `${packageRoot}/Contents/Resources/assets`;
	const plant = async (name: string, urls: string[]) => {
		const tipPath = `${tipAssets}/${name}`;
		const dataPath = `/data/${name}`;
		const tipOk = await tipHasFile(fs, tipPath);
		const dataOk = await tipHasFile(fs, dataPath);
		if (tipOk && dataOk) return;
		let buf: Uint8Array | null = null;
		if (tipOk) {
			try {
				buf = await readOpfsBytes(tipPath);
			} catch {
				buf = null;
			}
		}
		if (!buf) {
			for (const url of urls) {
				try {
					const res = await fetch(url, { cache: 'force-cache' });
					if (!res.ok) continue;
					buf = new Uint8Array(await res.arrayBuffer());
					break;
				} catch {
					/* try next */
				}
			}
		}
		if (!buf) return;
		if (!tipOk) await writePersistentFile(fs, tipPath, buf);
		if (!dataOk) await writeOpfsFile(dataPath, buf);
		diag('spells extra staged', { name, tip: !tipOk, data: !dataOk });
	};
	await plant('spells.json', [
		`${base}/extras/spells.json`,
		`${base}/launcher/assets-current/Contents/Resources/assets/spells.json`,
	]);
	await plant('spells-previews.json', [
		`${base}/extras/spells-previews.json`,
		`${base}/launcher/assets-current/Contents/Resources/assets/spells-previews.json`,
	]);
}

async function writeAbsAndPackage(
	fs: BrowserFs,
	path: string,
	data: Uint8Array,
	packageRoot: string,
) {
	// Single runtime tree: tip CipSoft Contents/Resources under CIP_APPDATA
	// (resolveCipResourcesDir). No abs /data/assets or /Contents mirrors —
	// except qtclient boot RCC/fonts under /data (writeQtclientBootMirror).
	const cip = cipPackagePath(packageRoot, path);
	if (cip) {
		await writePersistentFile(fs, cip, data);
		writeQtclientBootMirror(fs, path, data);
		return;
	}
	// CDN things list uses tip-relative `/Contents/…` (catalog, appearances,
	// fonts, RCC). Persist under the package root only — never plant an abs
	// `/Contents` play-path mirror (that jetsams Safari after pack install).
	if (path.toLowerCase().startsWith('/contents/')) {
		await writePersistentFile(fs, `${packageRoot}${path}`, data);
		writeQtclientBootMirror(fs, path, data);
		return;
	}
	const parent = path.slice(0, path.lastIndexOf('/'));
	if (parent) fs.mkdirTree(parent);
	fs.writeFile(path, data);
	const pkg = `${packageRoot}${path}`;
	await writePersistentFile(fs, pkg, data);
	writeQtclientBootMirror(fs, path, data);
}

/**
 * Map CDN `/data/fonts/…` onto CipSoft Resources under the tip package (OPFS).
 * resolveCipResourcesDir reads
 * `packages/<client>/Contents/Resources/{assets,sounds,minimap}`.
 */
function cipPackagePath(packageRoot: string, path: string): string | null {
	const font = path.match(/^\/data\/fonts\/(.+)$/i);
	if (font) return `${packageRoot}/Contents/Resources/assets/fonts/${font[1]}`;
	return null;
}

/**
 * Sprite packs: tip CipSoft Contents/Resources only (OPFS + MEMFS).
 * No abs /data mirrors (triple tree OOM).
 */
async function writePackageOnly(
	fs: BrowserFs,
	path: string,
	data: Uint8Array,
	packageRoot: string,
) {
	const dest = cipPackagePath(packageRoot, path) ?? `${packageRoot}${path}`;
	await writePersistentFile(fs, dest, data);
}

/** Remove a MEMFS play-path tree (never under `/home/web_user` OPFS tip). */
function rmAbsPlayTree(fs: BrowserFs, path: string): void {
	const allowed =
		path === '/Contents' ||
		path === '/Contents/' ||
		path.startsWith('/Contents/') ||
		path === '/Resources' ||
		path === '/Resources/' ||
		path.startsWith('/Resources/') ||
		path.startsWith('/data/assets');
	if (!allowed) return;
	if (!fs.analyzePath(path).exists) return;
	try {
		const mode = fs.stat(path).mode;
		// Symlink → tip OPFS: unlink the link only (never recurse into tip).
		if (fs.isLink?.(mode)) {
			fs.unlink(path);
			return;
		}
		if (fsIsDir(fs, path)) {
			for (const name of fs.readdir(path)) {
				if (name === '.' || name === '..') continue;
				rmAbsPlayTree(fs, `${path}/${name}`);
			}
			fs.rmdir?.(path);
		} else {
			fs.unlink(path);
		}
	} catch {
		/* ignore */
	}
}

/**
 * Tip AppData `Contents/Resources` is the only assets tree (resolveCipResourcesDir).
 * Wipe abs `/Contents` + `/data/assets` leftovers so they cannot confuse
 * other probes; do not plant mirrors or play-path symlinks.
 */
function exposePackageAssetsForPlay(
	fs: BrowserFs,
	packageRoot: string,
): number {
	rmAbsPlayTree(fs, '/Contents/Resources');
	rmAbsPlayTree(fs, '/Resources');
	rmAbsPlayTree(fs, '/data/assets');
	const cipCatalog = `${packageRoot}/Contents/Resources/assets/catalog-content.json`;
	return fs.analyzePath(cipCatalog).exists ? 1 : 0;
}

/**
 * qtclient host WASM is stock CipSoft (`TIBIA_CLIENT_PACKAGE_DIR=Tibia.app`); a
 * branded tip may use another directoryname (pack `client.packageDir`).
 * gamecore::resolveCipResourcesDir
 * only looks at the compile-time name, so alias the stock dir at the tip.
 */
function ensureQtclientHostPackageAlias(
	fs: BrowserFs,
	packageRoot: string,
): void {
	const stockHostPackage = 'Tibia.app';
	// PACKAGE_CLIENT comes from the pack config; compare as string so a
	// stock CipSoft rename still short-circuits without a never-overlap error.
	if ((PACKAGE_CLIENT as string) === stockHostPackage) return;
	const packagesDir = `${CIP_APPDATA}/packages`;
	const aliasRoot = `${packagesDir}/${stockHostPackage}`;
	if (aliasRoot === packageRoot) return;
	const tipCatalog = `${packageRoot}/Contents/Resources/assets/catalog-content.json`;
	if (!fs.analyzePath(tipCatalog).exists) return;
	const aliasCatalog = `${aliasRoot}/Contents/Resources/assets/catalog-content.json`;
	if (fs.analyzePath(aliasCatalog).exists) return;
	if (fs.analyzePath(aliasRoot).exists) {
		// Stale empty/partial tree — replace with symlink to the product tip.
		rmAbsPlayTree(fs, aliasRoot);
	}
	fs.mkdirTree(packagesDir);
	if (typeof fs.symlink !== 'function') {
		diagWarn('ensureQtclientHostPackageAlias: FS.symlink missing', {
			packageRoot,
			aliasRoot,
		});
		return;
	}
	try {
		// Relative target so the link stays valid under the packages/ dir.
		fs.symlink(PACKAGE_CLIENT, aliasRoot);
		diag('ensureQtclientHostPackageAlias', {
			from: stockHostPackage,
			to: PACKAGE_CLIENT,
		});
	} catch (err) {
		diagWarn('ensureQtclientHostPackageAlias failed', {
			err: err instanceof Error ? err.message : String(err),
		});
	}
}

function isSpriteSheetPath(path: string): boolean {
	const norm = path.toLowerCase().replace(/\\/g, '/');
	const base = norm.slice(norm.lastIndexOf('/') + 1);
	return (
		base.startsWith('sprites-') &&
		(base.endsWith('.bmp.lzma') || base.endsWith('.bmp'))
	);
}

/** True when tip Cip assets already expose at least one sprite sheet (OPFS hydrate). */
function tipHasSpriteSheets(fs: BrowserFs, packageRoot: string): boolean {
	const assets = `${packageRoot}/Contents/Resources/assets`;
	try {
		if (!fs.analyzePath(assets).exists) return false;
	} catch {
		return false;
	}
	const walk = (dir: string, depth: number): boolean => {
		// WasmFS has aborted whole Modules on deep readdir — keep this shallow.
		if (depth > 3) return false;
		let names: string[];
		try {
			names = fs.readdir(dir);
		} catch {
			return false;
		}
		for (const name of names) {
			if (name === '.' || name === '..') continue;
			const full = `${dir}/${name}`;
			try {
				if (isSpriteSheetPath(full)) return true;
				if (fsIsDir(fs, full) && walk(full, depth + 1)) return true;
			} catch {
				/* ignore */
			}
		}
		return false;
	};
	try {
		return walk(assets, 0);
	} catch {
		return false;
	}
}

/**
 * Tip under CIP_APPDATA is already the play tree (OPFS hydrate + MEMFS).
 * `essentialsOnly` is a no-op count of tip essentials (no abs /data mirrors).
 */
function installPackageTree(
	fs: BrowserFs,
	packageRoot: string,
	opts?: { essentialsOnly?: boolean },
) {
	if (!fs.analyzePath(packageRoot).exists) return 0;
	const essentialsOnly = !!opts?.essentialsOnly;
	let count = 0;
	const walk = (dir: string) => {
		for (const name of fs.readdir(dir)) {
			if (name === '.' || name === '..') continue;
			const full = `${dir}/${name}`;
			if (fsIsDir(fs, full)) {
				walk(full);
				continue;
			}
			const rel = full.slice(packageRoot.length).replace(/^\/+/, '');
			if (
				!rel ||
				rel.endsWith('package.json') ||
				rel.endsWith('package.json.version') ||
				(rel.endsWith('.sha256') && !rel.endsWith('assets.json.sha256')) ||
				rel === SPRITE_PACKS_STAMP ||
				rel.endsWith(`/${SPRITE_PACKS_STAMP}`) ||
				rel.includes(`${SPRITE_PACKS_STAMP}.partial`)
			)
				continue;
			const dest = `/${rel}`;
			if (essentialsOnly && !isBootEssential(dest)) continue;
			count += 1;
		}
	};
	walk(packageRoot);
	return count;
}

type ContentList = {
	files?: Record<string, { sha256?: string; size?: number }>;
	packs?: Array<{ sha256?: string; size?: number; files?: string[] }>;
	revision?: string;
};

type ReleaseDoc = {
	targets?: Record<string, { things?: string }>;
};

/** Catalog / appearances / UI fonts — enough for loadAssets + login chrome. */
function isBootEssential(path: string): boolean {
	const p = path.toLowerCase();
	if (p.includes('/fonts/') && p.endsWith('.ttf')) return true;
	const underAssets =
		p.startsWith('/contents/resources/assets/') ||
		p.startsWith('/contents/resources/sounds/') ||
		p.startsWith('/resources/assets/') ||
		p.startsWith('/resources/sounds/') ||
		p.startsWith('/data/assets/') ||
		p.startsWith('/contents/macos/');
	if (!underAssets) return false;
	return (
		p.includes('catalog-content') ||
		p.includes('appearances-') ||
		p.includes('staticdata-') ||
		p.includes('staticmapdata-') ||
		p.includes('graphics_resources.rcc') ||
		p.includes('/map-') ||
		p.endsWith('assets.json.sha256') ||
		p.includes('proficiencies-') ||
		p.endsWith('/spells.json') ||
		p.endsWith('/spells-previews.json') ||
		p.endsWith('minimap-markers.json')
	);
}

async function tipHasFile(
	_fs: BrowserFs,
	path: string,
	size?: number,
): Promise<boolean> {
	void _fs;
	if (!(await opfsPathExists(path))) return false;
	if (size === undefined || size <= 0) return true;
	const got = await opfsFileSize(path);
	return got === size;
}

async function writeMemfs(
	fs: BrowserFs,
	path: string,
	data: Uint8Array,
	packageRoot = PACKAGE_ROOT,
) {
	await writeAbsAndPackage(fs, path, data, packageRoot);
}

/** CipSoft AppData only: `<CIP_APPDATA>/packages/<PACKAGE_CLIENT>/`. */
function normalizePackageRoot(packageRoot?: string | null): string {
	const raw = packageRoot?.trim().replace(/\/+$/, '') || '';
	if (raw && raw !== PACKAGE_ROOT && !raw.startsWith(`${PACKAGE_ROOT}/`)) {
		console.warn(
			'[play] launcher packageRoot ≠ CipSoft AppData; using CipSoft AppData',
			{ fromLauncher: raw, hostAppData: PACKAGE_ROOT },
		);
	}
	return PACKAGE_ROOT;
}

const HEX64 = /^[a-f0-9]{64}$/i;

function isContentDigest(digest: string): boolean {
	return HEX64.test(digest);
}

/** Reject zip-slip / absolute escapes; allow CIP package paths + legacy /data/… */
function safeMemfsPath(name: string): string | null {
	const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
	if (!normalized || normalized.includes('\0')) return null;
	const parts = normalized.split('/');
	if (parts.some((p) => p === '..' || p === '')) return null;
	const top = (parts[0] || '').toLowerCase();
	if (top !== 'data' && top !== 'contents') return null;
	return `/${parts.join('/')}`;
}

async function sha256Hex(buf: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', buf as BufferSource);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

function contentUrl(cdn: string, digest: string): string {
	return `${cdn.replace(/\/+$/, '')}/content/${digest.slice(0, 2)}/${digest}`;
}

function packUrl(cdn: string, digest: string): string {
	return `${cdn.replace(/\/+$/, '')}/packs/${digest.slice(0, 2)}/${digest}.zip`;
}

/** Sprite sheets and CIP default minimap tiles (same zip pack today). */
function packNeededForPlay(files: string[] | undefined): boolean {
	return (files ?? []).some(
		(f) =>
			f.includes('sprites-') ||
			f.includes('/minimap/') ||
			f.endsWith('/minimap.otmm'),
	);
}

/** CipSoft tip Resources/minimap (sibling of assets). */
function minimapSourceDirs(_fs: BrowserFs, packageRoot?: string): string[] {
	if (!packageRoot) return [];
	return [
		`${packageRoot}/Contents/Resources/minimap`,
		`${packageRoot}/Contents/Resources/assets/minimap`,
	];
}

function dirHasMinimapColor(fs: BrowserFs, dir: string): boolean {
	try {
		if (!fs.analyzePath(dir).exists) return false;
		for (const name of fs.readdir(dir)) {
			if (name.startsWith('Minimap_Color_')) return true;
		}
	} catch {
		/* ignore */
	}
	return false;
}

/** True when CipSoft default minimap colour tiles are on MEMFS under the tip. */
function minimapTilesPresent(fs: BrowserFs, packageRoot?: string): boolean {
	return minimapSourceDirs(fs, packageRoot).some((dir) =>
		dirHasMinimapColor(fs, dir),
	);
}

/** Survives qtclient→game remount and Safari kill/reload (unlike session handoff). */
const THINGS_READY_KEY = `${BRAND_KEY}.things.rev`;

export function rememberThingsReady(rev: string): void {
	const v = rev.trim();
	if (!v) return;
	try {
		localStorage.setItem(THINGS_READY_KEY, v);
	} catch {
		/* private mode */
	}
}

export function clearThingsReady(): void {
	try {
		localStorage.removeItem(THINGS_READY_KEY);
	} catch {
		/* ignore */
	}
}

export function storedThingsReady(): string | null {
	try {
		return localStorage.getItem(THINGS_READY_KEY);
	} catch {
		return null;
	}
}

/** CDN things list revision (same stamp qtclient writes to `.tibia-sprite-packs`). */
export async function peekRemoteThingsRevision(
	cdn: string,
): Promise<string | null> {
	const base = cdn.replace(/\/+$/, '');
	try {
		const releaseRes = await fetch(`${base}/latest/release.json`, {
			cache: 'no-store',
		});
		if (!releaseRes.ok) return null;
		const release = (await releaseRes.json()) as ReleaseDoc;
		const thingsRel = release.targets?.web?.things;
		if (!thingsRel) return null;
		const listRes = await fetch(`${base}/${thingsRel.replace(/^\/+/, '')}`, {
			cache: 'no-store',
		});
		if (!listRes.ok) return null;
		const list = (await listRes.json()) as ContentList;
		return list.revision?.trim() || null;
	} catch {
		return null;
	}
}

/**
 * CIP InstalledAndUsable gate for /play: tip things stamp on OPFS matches CDN.
 * When true, skip qtclient Widgets and boot one game-only Module (same intent as
 * desktop qtclient warm auto-Play).
 */
export async function shouldAutoSkipQtclientLauncher(cdn: string): Promise<{
	skip: boolean;
	thingsRev: string | null;
	stored: string | null;
	opfs: boolean;
}> {
	const stored = storedThingsReady();
	const thingsRev = await peekRemoteThingsRevision(cdn);
	if (!thingsRev || !stored || stored !== thingsRev) {
		return { skip: false, thingsRev, stored, opfs: false };
	}
	const opfs = await opfsThingsStampMatches(thingsRev);
	if (!opfs) {
		clearThingsReady();
		return { skip: false, thingsRev, stored, opfs: false };
	}
	return { skip: true, thingsRev, stored, opfs: true };
}

/**
 * `essentials` — catalog/RCC/fonts only (before callMain; no sprite stamp).
 * `install` — essentials + sprite zip packs (launcher before Play).
 * `verify` — confirm stamp+essentials+sprites; throw if tip incomplete.
 */
type ThingsInstallMode = 'essentials' | 'install' | 'verify';

/**
 * Boot essentials (+ optional sprite zip packs) into the CIP tip package (OPFS).
 * Embed WASM: tip `Contents/Resources/{assets,sounds,minimap}` before callMain
 * (`resolveCipResourcesDir` / `assetsRoot`). Launcher `__qtclientInstallThings`
 * uses `install` for sprite packs before Play.
 */
async function syncThingsFromCdn(
	fs: BrowserFs,
	cdn: string,
	onStatus?: (text: string, progress: number) => void,
	mode: ThingsInstallMode = 'install',
	packageRootArg?: string | null,
): Promise<number> {
	const packageRoot = normalizePackageRoot(packageRootArg);
	const stampPath = `${packageRoot}/${SPRITE_PACKS_STAMP}`;
	const base = cdn.replace(/\/+$/, '');
	diagFlush('things sync start', { mode, packageRoot, cdn: base });
	const releaseRes = await fetch(`${base}/latest/release.json`, {
		cache: 'no-store',
	});
	if (!releaseRes.ok)
		throw new Error(`CDN release.json HTTP ${releaseRes.status}`);
	const release = (await releaseRes.json()) as ReleaseDoc;
	const thingsRel = release.targets?.web?.things;
	if (!thingsRel) throw new Error('release.json has no web.things list');
	const listRes = await fetch(`${base}/${thingsRel.replace(/^\/+/, '')}`, {
		cache: 'no-store',
	});
	if (!listRes.ok) throw new Error(`CDN things list HTTP ${listRes.status}`);
	const list = (await listRes.json()) as ContentList;
	const all = Object.entries(list.files ?? {}).map(([path, entry]) => ({
		path: path.startsWith('/') ? path : `/${path}`,
		digest: entry.sha256 ?? '',
		size: entry.size ?? 0,
	}));
	const essentials = all.filter(
		(f) => isBootEssential(f.path) && f.digest && isContentDigest(f.digest),
	);
	if (essentials.length === 0) throw new Error('things list has no boot files');

	const thingsRev = list.revision?.trim() || 'unknown';
	const stampMatchesMem = (path: string) => {
		try {
			return (
				fs.analyzePath(path).exists &&
				new TextDecoder().decode(fs.readFile(path)).trim() === thingsRev
			);
		} catch {
			return false;
		}
	};
	const haveStamp =
		stampMatchesMem(stampPath) || (await opfsThingsStampMatches(thingsRev));
	const catalogPath = `${packageRoot}/Contents/Resources/assets/catalog-content.json`;
	const resolveEssentialPath = async (f: {
		path: string;
		size: number;
	}): Promise<string | null> => {
		const cip = cipPackagePath(packageRoot, f.path);
		if (cip && (await tipHasFile(fs, cip, f.size))) return cip;
		const direct = `${packageRoot}${f.path}`;
		if (await tipHasFile(fs, direct, f.size)) return direct;
		return null;
	};
	const hasEssential = async (f: {
		path: string;
		size: number;
	}): Promise<boolean> => (await resolveEssentialPath(f)) !== null;
	/** Size-only short-circuit left zeroed/truncated appearances that still
	 * matched length — parse then OOB. Hash the critical tip files. */
	const essentialDigestOk = async (f: {
		path: string;
		size: number;
		digest: string;
	}): Promise<boolean> => {
		const abs = await resolveEssentialPath(f);
		if (!abs) return false;
		const bytes = await readOpfsBytes(abs);
		if (!bytes || bytes.byteLength !== f.size) return false;
		const got = await sha256Hex(bytes);
		return got === f.digest.toLowerCase();
	};
	const essentialsPresent = (
		await Promise.all(essentials.map((f) => hasEssential(f)))
	).every(Boolean);
	const criticalEssentials = essentials.filter(
		(f) =>
			f.path.toLowerCase().includes('appearances-') ||
			f.path.toLowerCase().includes('graphics_resources.rcc') ||
			f.path.toLowerCase().endsWith('/catalog-content.json'),
	);
	// No critical paths in this tip's essentials list → nothing to hash-check
	// (appearances may live only in packs). Empty must NOT force reinstall.
	const criticalDigestsOk =
		criticalEssentials.length === 0 ||
		(
			await Promise.all(criticalEssentials.map((f) => essentialDigestOk(f)))
		).every(Boolean);
	// Hydrated tip: stamp + catalog + boot essentials (appearances/RCC/fonts).
	// Stamp+catalog alone left empty/missing appearances → parse failure.
	if (
		haveStamp &&
		essentialsPresent &&
		criticalDigestsOk &&
		(await tipHasFile(fs, catalogPath))
	) {
		const exposed = exposePackageAssetsForPlay(fs, packageRoot);
		rememberThingsReady(thingsRev);
		diagFlush('things sync short-circuit', {
			mode,
			thingsRev,
			packageRoot,
			reason: 'stamp+catalog+essentials+digest',
			essentials: essentials.length,
			critical: criticalEssentials.length,
			exposed,
		});
		onStatus?.('Preparing…', 88);
		return essentials.length;
	}
	if (
		haveStamp &&
		essentialsPresent &&
		criticalEssentials.length > 0 &&
		!criticalDigestsOk
	) {
		diagWarn('things essentials size ok but digest mismatch — reinstall', {
			thingsRev,
			critical: criticalEssentials.length,
		});
	}
	if (haveStamp && (await tipHasFile(fs, catalogPath)) && !essentialsPresent) {
		diagWarn('things stamp+catalog incomplete essentials — reinstall', {
			thingsRev,
			essentials: essentials.length,
		});
	}
	const playPacks = (list.packs ?? []).filter(
		(p) => p.sha256 && isContentDigest(p.sha256) && packNeededForPlay(p.files),
	);
	let spritesInMemfs = false;
	try {
		spritesInMemfs = tipHasSpriteSheets(fs, packageRoot);
	} catch (err) {
		diagWarn('tipHasSpriteSheets failed', {
			err: err instanceof Error ? err.message : String(err),
		});
	}
	diagFlush('things list', {
		mode,
		thingsRev,
		essentials: essentials.length,
		packs: playPacks.length,
		haveStamp,
		essentialsPresent,
		spritesInMemfs,
	});

	if (mode === 'verify') {
		const spritesInMemfs = tipHasSpriteSheets(fs, packageRoot);
		const spritesOnOpfs =
			spritesInMemfs || (await opfsHasSpriteSheets(packageRoot));
		const minimapOk =
			minimapTilesPresent(fs, packageRoot) ||
			(await opfsHasMinimapTiles(packageRoot));
		if (
			haveStamp &&
			essentialsPresent &&
			(spritesOnOpfs || playPacks.length === 0)
		) {
			const exposed = exposePackageAssetsForPlay(fs, packageRoot);
			onStatus?.('Preparing…', 88);
			rememberThingsReady(thingsRev);
			diag('things verify ok', {
				minimapOk,
				exposed,
				spritesOk: spritesOnOpfs,
				spritesInMemfs,
			});
			return essentials.length;
		}
		clearThingsReady();
		throw new Error(
			`Tip incomplete for game boot (stamp=${haveStamp} essentials=${essentialsPresent} sprites=${spritesOnOpfs} minimap=${minimapOk})`,
		);
	}

	let written = 0;
	let downloaded = 0;
	let alreadyPresent = 0;
	diag('things essentials download start', {
		count: essentials.length,
	});
	for (const file of essentials) {
		if (await hasEssential(file)) {
			written += 1;
			alreadyPresent += 1;
			continue;
		}
		onStatus?.(
			'Updating…',
			20 + Math.round(((written + 1) / essentials.length) * 30),
		);
		const res = await fetch(contentUrl(base, file.digest));
		if (!res.ok) throw new Error(`Asset ${file.path} HTTP ${res.status}`);
		const buf = new Uint8Array(await res.arrayBuffer());
		if (file.size > 0 && buf.byteLength !== file.size)
			throw new Error(
				`Asset ${file.path} size mismatch (${buf.byteLength} != ${file.size})`,
			);
		const got = await sha256Hex(buf);
		if (got !== file.digest.toLowerCase())
			throw new Error(`Asset ${file.path} digest mismatch`);
		await writeMemfs(fs, file.path, buf, packageRoot);
		written += 1;
		downloaded += 1;
	}
	diagFlush('things essentials done', {
		written,
		downloaded,
		alreadyPresent,
	});

	// callMain needs RCC/catalog/fonts only — sprite zips stay launcher-owned.
	if (mode === 'essentials') {
		onStatus?.('Preparing…', 88);
		// qtclient boot with tip already stamped — remount game-only (never qtclient +
		// sprites in one Module).
		if (haveStamp) {
			rememberThingsReady(thingsRev);
			diagFlush('qtclient bypass → game remount', { thingsRev });
			try {
				sessionStorage.setItem(PLAY_HANDOFF_KEY, '1');
				sessionStorage.setItem(PLAY_TRANSITION_KEY, '1');
			} catch {
				/* continue */
			}
			location.reload();
			await new Promise<never>(() => undefined);
		}
		return written;
	}

	const stampFresh =
		stampMatchesMem(stampPath) || (await opfsThingsStampMatches(thingsRev));
	// Stamp can be fresh while sprites are missing (false digest-mismatch path
	// used to skip packs). Force install when play needs packs and OPFS has none.
	const needPacks =
		playPacks.length > 0 && (!stampFresh || !spritesInMemfs);
	diagFlush('things packs phase', {
		stampFresh,
		playPacks: playPacks.length,
		spritesInMemfs,
		needPacks,
	});
	if (needPacks) {
		const files = await installPlayPacksToOpfs(
			fs,
			base,
			packageRoot,
			playPacks,
			onStatus,
		);
		written += files;
		const stampBytes = new TextEncoder().encode(thingsRev);
		await writePersistentFile(fs, stampPath, stampBytes);
	} else if (!stampFresh) {
		const stampBytes = new TextEncoder().encode(thingsRev);
		await writePersistentFile(fs, stampPath, stampBytes);
		diagFlush('things stamped without packs', { thingsRev });
	}

	const exposed = exposePackageAssetsForPlay(fs, packageRoot);
	rememberThingsReady(thingsRev);
	diagFlush('things sync done', { written, mode, exposed });
	return written;
}

/**
 * Unzip CDN packs into tip Cip paths on OPFS (+ MEMFS expose). Serial so
 * peak RAM during install is one zip at a time. Throws on any pack failure.
 */
async function installPlayPacksToOpfs(
	fs: BrowserFs,
	cdn: string,
	packageRoot: string,
	playPacks: Array<{ sha256?: string; size?: number; files?: string[] }>,
	onStatus?: (text: string, progress: number) => void,
): Promise<number> {
	let files = 0;
	for (let i = 0; i < playPacks.length; i++) {
		const pack = playPacks[i]!;
		const digest = pack.sha256!;
		const digestKey = digest.toLowerCase();
		onStatus?.('Updating…', 50 + Math.round(((i + 1) / playPacks.length) * 45));
		diagFlush('things pack install', {
			i: i + 1,
			of: playPacks.length,
			digest: digest.slice(0, 8),
			size: pack.size ?? null,
		});
		const res = await fetch(packUrl(cdn, digest));
		if (!res.ok) {
			throw new Error(
				`sprite pack ${digest.slice(0, 8)} HTTP ${res.status}`,
			);
		}
		let zip = new Uint8Array(await res.arrayBuffer());
		const got = await sha256Hex(zip);
		if (got !== digestKey) {
			throw new Error(
				`sprite pack ${digest.slice(0, 8)} digest mismatch`,
			);
		}
		const unzipped = unzipSync(zip);
		zip = new Uint8Array(0); // drop zip buffer before writing files
		const entries: Array<{ path: string; data: Uint8Array }> = [];
		for (const [name, data] of Object.entries(unzipped)) {
			if (!data) continue;
			const path = safeMemfsPath(name);
			if (!path) continue;
			entries.push({ path, data });
		}
		// qtclientFs message RPCs are concurrent across paths (worker per-path lock).
		const concurrency = 6;
		let cursor = 0;
		async function worker(): Promise<void> {
			for (;;) {
				const i = cursor++;
				if (i >= entries.length) return;
				const ent = entries[i]!;
				await writePackageOnly(fs, ent.path, ent.data, packageRoot);
			}
		}
		await Promise.all(
			Array.from({ length: Math.min(concurrency, entries.length) }, () =>
				worker(),
			),
		);
		const fileCount = entries.length;
		files += fileCount;
		diagFlush('things pack written', {
			i: i + 1,
			of: playPacks.length,
			digest: digest.slice(0, 8),
			files: fileCount,
		});
		// Yield so Safari can reclaim between ~17MB packs.
		await new Promise<void>((r) => setTimeout(r, 0));
	}
	diagFlush('things packs done', { packs: playPacks.length, files });
	return files;
}

/**
 * Launcher-phase install: write things into the running Module.FS (OPFS tip) so
 * Play remount finds them via installPackageTree. Bound as window.__qtclientInstallThings.
 * `fs` / `packageRoot` come from the launcher EM_ASM (MODULARIZE does not put
 * FS on window; packageRoot must match tip directoryname / PACKAGE_CLIENT).
 */
export async function installThingsForLauncher(
	cdn: string,
	fsArg?: BrowserFs | null,
	packageRoot?: string | null,
	onStatus?: (text: string, progress: number) => void,
): Promise<number> {
	const w = window as Window & {
		FS?: BrowserFs;
		Module?: { FS?: BrowserFs };
	};
	const fs = fsArg ?? w.FS ?? w.Module?.FS;
	if (!fs?.writeFile)
		throw new Error('Launcher FS not ready for things install');
	w.FS = fs;
	if (w.Module) w.Module.FS = fs;
	const resolved = normalizePackageRoot(packageRoot);
	diagFlush('installThingsForLauncher', {
		fromLauncher: packageRoot ?? null,
		resolved,
		expected: PACKAGE_ROOT,
	});
	console.info('[play] things install CipSoft package root', {
		fromLauncher: packageRoot ?? null,
		resolved,
		expected: PACKAGE_ROOT,
	});
	try {
		const n = await syncThingsFromCdn(
			fs,
			cdn,
			onStatus,
			'install',
			packageRoot,
		);
		ensureQtclientHostPackageAlias(fs, resolved);
		await ensureQtclientBootAssetsFromPackage(fs, resolved);
		diagFlush('installThingsForLauncher done', { written: n });
		// qtclient Play remount is owned by qtclient's play(); /play boots game-only and
		// verifies OPFS tip before callMain.
		return n;
	} catch (err) {
		diagWarn(
			'installThingsForLauncher failed',
			{ err: err instanceof Error ? err.message : String(err) },
			{ flush: true },
		);
		throw err;
	}
}

export function takePlayHandoff(): boolean {
	try {
		const flagged = sessionStorage.getItem(PLAY_HANDOFF_KEY) === '1';
		sessionStorage.removeItem(PLAY_HANDOFF_KEY);
		return flagged;
	} catch {
		return false;
	}
}

function takePlayTransition(): boolean {
	try {
		const flagged = sessionStorage.getItem(PLAY_TRANSITION_KEY) === '1';
		sessionStorage.removeItem(PLAY_TRANSITION_KEY);
		return flagged;
	} catch {
		return false;
	}
}

/** Full-stage cover so Play → remount does not flash an empty black page. */
export function showPlayTransition(status = 'Starting…'): HTMLElement {
	const stage = document.getElementById('play-stage') ?? document.body;
	let el = document.getElementById('play-transition');
	if (!el) {
		// Styles come from /styles/play-shell.css (.play-transition*).
		el = document.createElement('div');
		el.id = 'play-transition';
		el.className = 'play-transition';
		const statusEl = document.createElement('p');
		statusEl.id = 'play-transition-status';
		const bar = document.createElement('div');
		bar.id = 'play-transition-bar';
		bar.className = 'play-transition-bar';
		const fill = document.createElement('div');
		fill.id = 'play-transition-fill';
		fill.className = 'play-transition-fill';
		bar.appendChild(fill);
		el.appendChild(statusEl);
		el.appendChild(bar);
		stage.appendChild(el);
	}
	updatePlayTransition(status, 8);
	el.style.opacity = '1';
	el.style.pointerEvents = 'auto';
	return el;
}

export function updatePlayTransition(status: string, progress?: number): void {
	const statusEl = document.getElementById('play-transition-status');
	if (statusEl) statusEl.textContent = status;
	const fill = document.getElementById('play-transition-fill');
	if (fill && progress !== undefined) {
		fill.style.width = `${Math.max(4, Math.min(100, progress))}%`;
	}
}

export function hidePlayTransition(): void {
	const el = document.getElementById('play-transition');
	if (!el) return;
	el.style.opacity = '0';
	el.style.pointerEvents = 'none';
	// Do not remove the node — /play owns #play-transition in the Svelte
	// template; el.remove() can remount the page and re-enter bootTibia.
}

/**
 * No tip prefetch — the CIP launcher owns client lzma install into
 * packages/<PACKAGE_CLIENT>; Play tip AppData is OPFS (engine bytes stay IDB).
 */
export async function prefetchGameEngine(_cdn: string): Promise<void> {
	/* intentionally empty */
}

/**
 * @deprecated qtclient launcher Play remounts via sessionStorage + reload.
 * Kept so an old Module calling `__qtclientStartGame` still hands off.
 */
export async function startGameFromLauncher(): Promise<void> {
	try {
		sessionStorage.setItem(PLAY_HANDOFF_KEY, '1');
		sessionStorage.setItem(PLAY_TRANSITION_KEY, '1');
	} catch {
		/* continue */
	}
	location.reload();
}

/**
 * Bootstrap game tip (tibia.js / .wasm) into IndexedDB for /play.
 * Used on warm qtclient-skip and qtclient Play remount (game-only Module).
 */
export async function bootstrapClientPackage(
	cdn: string,
	onProgress?: (p: PackageProgress) => void,
): Promise<{ version: string; fromCache: boolean }> {
	const base = tipUrl(cdn, 'launcher/tibiaclient-web-current');
	return ensurePackageInIdb({
		packageName: PACKAGE_CLIENT,
		packageBase: base,
		localfiles: ['tibia.js', 'tibia.wasm', 'qtloader.js'],
		onProgress,
	});
}

/**
 * Bootstrap qtclient tip (launcher.js / .wasm) into IndexedDB for cold /play.
 * Matches desktop’s Widgets-only qtclient binary (no QML / gamecore).
 */
export async function bootstrapLauncherPackage(
	cdn: string,
	onProgress?: (p: PackageProgress) => void,
): Promise<{ version: string; fromCache: boolean }> {
	const base = tipUrl(cdn, 'launcher/launcher-web-current');
	return ensurePackageInIdb({
		packageName: PACKAGE_LAUNCHER,
		packageBase: base,
		localfiles: ['launcher.js', 'launcher.wasm', 'qtloader.js'],
		onProgress,
	});
}

/**
 * Empty the pre-spawned pthread pool in tip glue.
 *
 * `PTHREAD_POOL_SIZE=navigator.hardwareConcurrency` bakes `pthreadPoolSize=8`
 * into tibia.js. createWasm then Atomics.waits while 8 Workers fetch the
 * engine script; under Vite/Electron those Worker fetches never finish and
 * /play hangs at tibia_entry. Bare tip's static server is fine — /play is
 * not. Spawning on demand (pool size 0) unblocks instantiate; Qt still
 * creates Workers when it first needs a thread.
 */
export function patchPthreadPoolSize(
	bytes: ArrayBuffer,
	size = 1,
): ArrayBuffer {
	const text = new TextDecoder().decode(bytes);
	// Tip may already ship pool=1; still normalize any digit so /play does not
	// Atomics.wait on a cold Worker pool during createWasm.
	const next = text.replace(
		/var pthreadPoolSize=\d+;while\(pthreadPoolSize--\)\{PThread\.allocateUnusedWorker\(\)\}/,
		`var pthreadPoolSize=${size};while(pthreadPoolSize--){PThread.allocateUnusedWorker()}`,
	);
	if (next === text) {
		// Tip may already ship the desired pool size (stock wasm PTHREAD_POOL_SIZE=1).
		if (!new RegExp(`var pthreadPoolSize=${size};`).test(text)) {
			console.warn(
				'[play] pthreadPoolSize patch missed — /play may hang at tibia_entry',
			);
		}
		return bytes;
	}
	return new TextEncoder().encode(next).buffer;
}

/**
 * Skip Emscripten Fetch's IndexedDB bootstrap.
 *
 * `Fetch.openDatabase("emscripten_filesystem")` adds runDep library_fetch_init
 * and under /play that open often never fires onsuccess/onerror (DB stays
 * blocked after a prior hung Module), so createWasm never finishes. Qt net
 * uses websocket.js, not Fetch IDBFS — safe to skip.
 */
export function patchSkipFetchIdb(bytes: ArrayBuffer): ArrayBuffer {
	const text = new TextDecoder().decode(bytes);
	const next = text.replace(
		/addRunDependency\("library_fetch_init"\);Fetch\.openDatabase\("emscripten_filesystem",1,onsuccess,onerror\)/,
		'Fetch.dbInstance=false',
	);
	if (next === text) {
		console.warn('[play] Fetch IDB skip patch missed');
		return bytes;
	}
	return new TextEncoder().encode(next).buffer;
}

/**
 * Fixed-heap tip (ALLOW_MEMORY_GROWTH=0): ensure INITIAL_MEMORY matches the
 * linked wasm memory max. Portal must not invent a larger SAB than the module
 * declared (instantiate fails). When CMake bumps QT_WASM_INITIAL_MEMORY, the
 * linked tibia.js default is the source of truth — this only logs it.
 */
export function patchWasmInitialMemory(bytes: ArrayBuffer): ArrayBuffer {
	const text = new TextDecoder().decode(bytes);
	const m = text.match(/INITIAL_MEMORY=Module\["INITIAL_MEMORY"\]\|\|(\d+)/);
	if (m) {
		diag('INITIAL_MEMORY', { bytes: Number(m[1]) });
	} else {
		console.warn('[play] INITIAL_MEMORY probe missed');
	}
	return bytes;
}

/**
 * JSPI qtclient-fs promising contract:
 *
 * 1. `main` — emscripten exportPattern / callMain (already promising).
 *    Qt app.exec() stays on that activation; qtclientFs EM_ASYNC_JS suspends there.
 * 2. `__wasm_call_ctors` — stock initRuntime() calls it bare; await
 *    promising(ctors) inside async initRuntime/doRun (Safari SuspendError).
 * 3. True JS→wasm re-entries (`_emscripten_async_call`, embind async dyn,
 *    pthread invokeEntryPoint) — wrap at the call site with safePromising.
 *
 * NEVER promising-wrap via getWasmTableEntry / force isAsyncExport≡true.
 * Stock getWasmTableEntry caches makeAsyncFunction wrappers for anything in
 * asyncExports; invoke_* and Qt EH then call those wrappers as sync wasm
 * funcs, get a Promise instead of an i32, and shortly OOB / "null function"
 * after the login mask. Table slots stay raw WebAssembly.Function.
 */
export function patchJspiPromisingWrap(bytes: ArrayBuffer): ArrayBuffer {
	const text = new TextDecoder().decode(bytes);
	let next = text;
	const flags = {
		rawTable: false,
		asyncCall: false,
		dyn: false,
		invoke: false,
		ctors: false,
		table: false,
	};

	// Safe promising: Chromium throws if Argument 0 is a JS table import
	// (not a WebAssembly.Function). Only real wasm exports may call promising().
	const safePromising =
		'function __qtcSafePromising(fn){if(!fn||fn.__qtcPromising)return fn;try{if(typeof WebAssembly.Function==="function"&&!(fn instanceof WebAssembly.Function))return fn;var f=WebAssembly.promising(fn);try{f.__qtcPromising=1}catch(e){}return f}catch(e){return fn}}';
	if (!next.includes('__qtcSafePromising')) {
		const asyncifyAnchor = 'var Asyncify={';
		if (next.includes(asyncifyAnchor)) {
			next = next.replace(asyncifyAnchor, `${safePromising};var Asyncify={`);
		} else {
			next = `${safePromising};${next}`;
		}
	}

	// Tag promising wrappers (export-time makeAsyncFunction only).
	const makeNeedle =
		'makeAsyncFunction(original){return WebAssembly.promising(original)}';
	if (next.includes(makeNeedle)) {
		next = next.replace(
			makeNeedle,
			'makeAsyncFunction(original){return __qtcSafePromising(original)}',
		);
	}

	// Raw function table — never cache promising wrappers (invoke_* is sync).
	const getTableNeedle =
		'var getWasmTableEntry=funcPtr=>{var func=wasmTableMirror[funcPtr];if(!func){wasmTableMirror[funcPtr]=func=wasmTable.get(funcPtr);if(Asyncify.isAsyncExport(func)){wasmTableMirror[funcPtr]=func=Asyncify.makeAsyncFunction(func)}}return func};';
	const getTableRep =
		'var getWasmTableEntry=funcPtr=>{var func=wasmTableMirror[funcPtr];if(!func){func=wasmTable.get(funcPtr);wasmTableMirror[funcPtr]=func}return func};';
	if (next.includes(getTableNeedle)) {
		next = next.replace(getTableNeedle, getTableRep);
		flags.rawTable = true;
		flags.table = true;
	}

	// Do NOT promising-wrap _emscripten_async_call. main already runs under
	// promising(app.exec); a second promising() from timers while qtclientFs is
	// suspended is a concurrent wasm activation on shared memory → corruption.
	// Qt's JSPI suspend/resume queues native events until processEvents.
	flags.asyncCall = false;

	// embind async dynCaller — call-site wrap only (table stays raw).
	const dynNeedle = 'if(isAsync){rtn=WebAssembly.promising(rtn)}';
	if (next.includes(dynNeedle)) {
		next = next.replace(
			dynNeedle,
			'if(isAsync){rtn=__qtcSafePromising(rtn)}',
		);
		flags.dyn = true;
	}

	// pthread entry: same double-wrap hazard.
	const invokeNeedle = 'WebAssembly.promising(getWasmTableEntry(ptr))';
	if (next.includes(invokeNeedle)) {
		next = next.replace(
			invokeNeedle,
			'__qtcSafePromising(getWasmTableEntry(ptr))',
		);
		flags.invoke = true;
	}

	// Ctors under promising — required when EM_ASYNC_JS is reachable from
	// static init (qtclientFs / Qt). Safe promising no-ops for non-wasm exports.
	const initNeedle =
		'function initRuntime(){runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker(Module);wasmExports["__wasm_call_ctors"]()}';
	const initRep =
		'async function initRuntime(){runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker(Module);var c=wasmExports["__wasm_call_ctors"];if(!c)return;var p=__qtcSafePromising(c);wasmExports["__wasm_call_ctors"]=p;await p()}';
	if (next.includes(initNeedle)) {
		next = next.replace(initNeedle, initRep);
		flags.ctors = true;
	}

	const doRunNeedle =
		'function doRun(){Module["calledRun"]=true;if(ABORT)return;initRuntime();preMain();readyPromiseResolve(Module);Module["onRuntimeInitialized"]?.();var noInitialRun=Module["noInitialRun"]||false;if(!noInitialRun)callMain(args);postRun()}';
	const doRunRep =
		'async function doRun(){Module["calledRun"]=true;if(ABORT)return;await initRuntime();preMain();readyPromiseResolve(Module);Module["onRuntimeInitialized"]?.();var noInitialRun=Module["noInitialRun"]||false;if(!noInitialRun)await callMain(args);postRun()}';
	if (next.includes(doRunNeedle)) {
		next = next.replace(doRunNeedle, doRunRep);
		flags.ctors = flags.ctors || next.includes('await initRuntime()');
	}

	// Neutralize older post-js that forced isAsyncExport≡true or wrapped the table.
	const forceTableNeedle =
		'Asyncify.isAsyncExport=function(){return true}';
	if (next.includes(forceTableNeedle)) {
		next = next.replace(
			forceTableNeedle,
			'Asyncify.isAsyncExport=function(){return false}',
		);
		flags.table = true;
	}

	if (next === text) {
		console.warn('[play] JSPI promising wrap patch missed');
		return bytes;
	}
	// Sanity: patched script must still parse (Safari rejects broken object literals).
	try {
		new Function(next);
	} catch (err) {
		console.warn('[play] JSPI promising wrap patch broke tibia.js', err);
		return bytes;
	}
	diag('JSPI promising wrap patched', flags);
	return new TextEncoder().encode(next).buffer;
}

/**
 * Soft-fail nullish Emval handles (belt-and-suspenders with JSPI qtclient-fs).
 * `handle[key]` on a stale null throws (often reading 'index') and aborts.
 * Tip ships `var __emval_get_property=(handle,key)=>{...}`.
 */
export function patchEmvalGetPropertyGuard(bytes: ArrayBuffer): ArrayBuffer {
	const text = new TextDecoder().decode(bytes);
	if (text.includes('__qtcEmvalGuard')) return bytes;
	const needle =
		'var __emval_get_property=(handle,key)=>{handle=Emval.toValue(handle);key=Emval.toValue(key);return Emval.toHandle(handle[key])};';
	const at = text.indexOf(needle);
	if (at < 0) {
		console.warn('[play] __emval_get_property patch missed');
		return bytes;
	}
	const replacement =
		'var __qtcEmvalGuard=1;var __emval_get_property=(handle,key)=>{handle=Emval.toValue(handle);key=Emval.toValue(key);if(handle==null){Module.__qtcEmvalNull=1;return Emval.toHandle(void 0)}return Emval.toHandle(handle[key])};';
	const next = text.slice(0, at) + replacement + text.slice(at + needle.length);
	diag('emval get_property guard patched');
	return new TextEncoder().encode(next).buffer;
}

/**
 * Qt GUI main never returns (QCoreApplication::exec). Under JSPI, callMain's
 * Promise stays pending for the process lifetime — awaiting it hangs qtLoad
 * (overlay stuck, Module never pinned). Start main, keep an async park frame
 * awaiting that Promise (JSPI activation retention), resolve qtLoad once the
 * instance is running. Matches tip qtloader.js source of truth.
 *
 * Also upgrades the older microtask-only detach (`mainResult.then` +
 * `await Promise.resolve()`) that IDB can retain after a tip qtloader bump:
 * without a live `await` on callMain, Chromium drops the promising activation
 * and the first post-exec qtclientFs/Qt suspend aborts with unreachable.
 */
export function patchQtLoaderJspiCallMain(bytes: ArrayBuffer): ArrayBuffer {
	const text = new TextDecoder().decode(bytes);
	// Tip SoT park already present.
	if (text.includes('__qtcMainPark')) return bytes;

	const replacement = `if (!originalNoInitialRun) {
            const __qtcQtMainDetach = instance.callMain(originalArguments);
            if (__qtcQtMainDetach && typeof __qtcQtMainDetach.then === 'function') {
                const __qtcMainPark = (async () => {
                    try { await __qtcQtMainDetach; }
                    catch (e) {
                        if (e == "unwind") return;
                        if (!onExitCalled) {
                            onExitCalled = true;
                            config.qt.onExit?.({
                                text: e && e.message ? e.message : String(e),
                                crashed: true
                            });
                        }
                    }
                })();
                instance.__qtcMainPark = __qtcMainPark;
                await Promise.race([
                    __qtcMainPark,
                    new Promise((resolve) => setTimeout(resolve, 50)),
                ]);
            }
        }`;

	const needles = [
		// Stock qtloader: await hangs forever under JSPI GUI main.
		'if (!originalNoInitialRun)\n            await instance.callMain(originalArguments);',
		'if (!originalNoInitialRun)\r\n            await instance.callMain(originalArguments);',
		'if(!originalNoInitialRun)await instance.callMain(originalArguments);',
		// Tip qtloader (CIP/Qt): fire-and-forget callMain — still returns a
		// Promise under JSPI; without a live park await, Safari/Chromium drop
		// the promising activation → call_indirect signature mismatch + dead clicks.
		'if (!originalNoInitialRun)\n            instance.callMain(originalArguments);',
		'if (!originalNoInitialRun)\r\n            instance.callMain(originalArguments);',
		'if(!originalNoInitialRun)instance.callMain(originalArguments);',
	];

	let next = text;
	for (const needle of needles) {
		if (next.includes(needle)) {
			next = next.replace(needle, replacement);
			break;
		}
	}

	// Older portal detach: .then() + microtask yield — not a live park await.
	if (next === text) {
		const microtaskDetach =
			/if\s*\(\s*!originalNoInitialRun\s*\)\s*\{\s*const mainResult\s*=\s*instance\.callMain\(originalArguments\);\s*if\s*\(\s*mainResult\s*&&\s*typeof mainResult\.then\s*===\s*['"]function['"]\s*\)\s*\{[\s\S]*?await Promise\.resolve\(\);\s*\}\s*\}/;
		if (microtaskDetach.test(next)) {
			next = next.replace(microtaskDetach, replacement);
		}
	}

	// Partial rename without park (e.g. __qtcQtMainDetach only).
	if (next === text && text.includes('__qtcQtMainDetach')) {
		const detachBlock =
			/if\s*\(\s*!originalNoInitialRun\s*\)\s*\{\s*const __qtcQtMainDetach\s*=\s*instance\.callMain\(originalArguments\);[\s\S]*?\n\s*\}/;
		if (detachBlock.test(next)) {
			next = next.replace(detachBlock, replacement);
		}
	}

	if (next === text) {
		console.warn(
			'[play] qtloader JSPI callMain detach patch missed — /play may hang at Launching…',
		);
		return bytes;
	}
	diag('qtloader JSPI callMain detached (Qt main never returns)');
	return new TextEncoder().encode(next).buffer;
}

export async function loadScriptFromBytes(
	bytes: ArrayBuffer,
	attr?: string,
): Promise<{ url: string; patchedBytes?: Uint8Array }> {
	// Linked tip: qtclient is no longer MAIN_MODULE — no GOT .sig patch.
	// Still return the engine bytes so callers can inspect size / reuse.
	const payload: ArrayBuffer = bytes;
	const patchedBytes = new Uint8Array(payload);
	const url = blobUrlForBytes(payload);
	await new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.async = true;
		if (attr) script.setAttribute(OTC_SCRIPT_ATTR, attr);
		script.src = url;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Failed to load script blob'));
		document.body.appendChild(script);
	});
	return { url, patchedBytes };
}

/** Classic `<script src>` load — same-origin URL so pthread Workers share it. */
export async function loadScriptFromUrl(
	url: string,
	attr?: string,
): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.async = true;
		if (attr) script.setAttribute(OTC_SCRIPT_ATTR, attr);
		script.src = url;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`Failed to load script ${url}`));
		document.body.appendChild(script);
	});
}

/** Seed IndexedDB LAUNCHER package into the running qtclient Module FS. */
export async function seedLauncherPackageIntoFs(
	fs: BrowserFsLike,
): Promise<void> {
	await seedIdbPackageToFs(fs, PACKAGE_LAUNCHER, [...LAUNCHER_ENGINE_FILES]);
}

/** Call from /play mount when resuming a Play handoff (or any game boot). */
export function resumePlayTransition(): void {
	const continuing = takePlayTransition();
	showPlayTransition(continuing ? 'Launching client…' : 'Loading client…');
}

declare global {
	interface Window {
		qtLoad?: (config: QtLoadConfig) => Promise<unknown>;
		tibia_entry?: (config: unknown) => Promise<TibiaModule>;
		launcher_entry?: (config: unknown) => Promise<TibiaModule>;
		/** Set by /play while the launcher is up; Qt Play calls this. */
		__qtclientStartGame?: () => void | Promise<void>;
		/** Bound to installThingsForLauncher while qtclient launcher is up. */
		__qtclientInstallThings?: typeof installThingsForLauncher;
	}
}

function wasmUrl(base: string, path: string, stamp?: string): string {
	const url = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
	return stamp ? `${url}?v=${encodeURIComponent(stamp)}` : url;
}

/**
 * CipSoft BackgroundImage on #play-stage (+ transition shell). Call early on
 * /play so warm boots are not a black void during IDB/OPFS/WASM.
 */
export function applyProductPlayCss(opts: {
	assetBase: string;
	packWasmBase?: string;
	engineStamp?: string;
}): void {
	const stage = document.getElementById('play-stage');
	if (!stage) return;
	const stamp = opts.engineStamp;
	const candidates = [
		opts.packWasmBase && CLIENT_PACK_ID
			? wasmUrl(
					opts.packWasmBase,
					`mods/${CLIENT_PACK_ID}/images/launcher/BackgroundImage.jpg`,
					stamp,
				)
			: '',
		wasmUrl(opts.assetBase, 'images/launcher/BackgroundImage.jpg', stamp),
	].filter(Boolean);
	if (candidates.length === 0) return;
	const applyBg = (bg: string) => {
		const style = {
			backgroundColor: '#0b0e12',
			backgroundImage: `url(${bg})`,
			backgroundSize: 'cover',
			backgroundPosition: 'center',
			backgroundRepeat: 'no-repeat',
		} as CSSStyleDeclaration;
		Object.assign(stage.style, style);
		const transition = document.getElementById('play-transition');
		if (transition) {
			Object.assign(transition.style, {
				backgroundColor: 'rgba(11, 14, 18, 0.72)',
				backgroundImage: `url(${bg})`,
				backgroundSize: 'cover',
				backgroundPosition: 'center',
				backgroundRepeat: 'no-repeat',
				backgroundBlendMode: 'darken',
			} as CSSStyleDeclaration);
		}
		diag('product play css applied', { bg });
	};
	// Probe so a missing tip-pack chrome falls through to /images/launcher.
	let idx = 0;
	const tryNext = () => {
		if (idx >= candidates.length) return;
		const bg = candidates[idx++];
		const img = new Image();
		img.onload = () => applyBg(bg);
		img.onerror = () => tryNext();
		img.src = bg;
	};
	tryNext();
}

/**
 * Stage mods/<pack> onto durable qtclient-fs OPFS before callMain.
 * Warm tip: reuse OPFS pack cache. Cold: fetch from CDN tip → OPFS `/mods/<pack>`.
 */
async function stageTipPack(
	fs: BrowserFs | BrowserFsLike,
	packBases: string[],
	stamp?: string,
	onStatus?: (text: string, progress: number) => void,
): Promise<number> {
	const writePack = async (abs: string, data: Uint8Array) => {
		void fs;
		await writeOpfsFile(abs, data);
	};

	const cacheStamp = (stamp ?? '').trim();
	const qtclientFsExists = async (path: string): Promise<boolean> => {
		const tip = (
			globalThis as unknown as {
				qtclientFs?: { existsAsync?: (p: string) => Promise<boolean>; exists?: (p: string) => boolean };
			}
		).qtclientFs;
		try {
			if (tip?.existsAsync) return await tip.existsAsync(path);
			if (tip?.exists) return tip.exists(path);
		} catch {
			/* fall through */
		}
		return opfsPathExists(path);
	};
	// Tip pack can gain brand/QML without a wasm stamp bump — fingerprint
	// .pack.stamp (content hash) so OPFS restages when tip pack bytes change.
	const fetchTipPackStamp = async (): Promise<string | null> => {
		for (const wasmBase of [...new Set(packBases.filter(Boolean))]) {
			const url = wasmUrl(wasmBase, `mods/${CLIENT_PACK_ID}/.pack.stamp`, stamp);
			try {
				const res = await fetch(url);
				if (!res.ok) continue;
				return (await res.text()).replace(/\r\n/g, '\n').trim();
			} catch {
				/* try next base */
			}
		}
		return null;
	};
	const tipPackStamp = await fetchTipPackStamp();
	const stagedPackStamp = tipPackStamp
		? await readOpfsText(`/mods/${CLIENT_PACK_ID}/.pack.stamp`)
		: null;
	const brandOk = await qtclientFsExists(`/mods/${CLIENT_PACK_ID}/brand.json`);
	const stampOk = !cacheStamp || (await opfsPackCacheStampMatches(cacheStamp));
	const packOk =
		!tipPackStamp || (stagedPackStamp != null && stagedPackStamp.trim() === tipPackStamp);
	if (brandOk && stampOk && packOk) {
		const staged = await listOpfsFiles(`/mods/${CLIENT_PACK_ID}`);
		diagFlush('stageTipPack already staged', {
			stamp: cacheStamp || null,
			files: staged.length,
			packStamp: tipPackStamp ? tipPackStamp.slice(0, 16) : null,
		});
		onStatus?.('Launching client…', 92);
		return Math.max(1, staged.length);
	}
	if (brandOk && !packOk) {
		diagWarn('stageTipPack tip pack changed — restage', {
			stamp: cacheStamp || null,
			staged: stagedPackStamp?.slice(0, 16) ?? null,
			tip: tipPackStamp?.slice(0, 16) ?? null,
		});
	}
	if (cacheStamp && (await opfsPackCacheStampMatches(cacheStamp)) && packOk) {
		onStatus?.('Launching client…', 92);
		// Cache hit but /mods not planted yet — copy via qtclient-fs writes.
		const cached = await listOpfsFiles(PACK_CACHE_ROOT);
		let n = 0;
		let hasBrand = false;
		// Serial copy — Safari OPFS createWritable is not safe at concurrency.
		for (const item of cached) {
			const data = await readOpfsBytes(item.abs);
			if (!data) continue;
			if (item.rel === 'brand.json') hasBrand = true;
			await writePack(`/mods/${CLIENT_PACK_ID}/${item.rel}`, data);
			n += 1;
		}
		if (n > 0 && hasBrand) {
			diagFlush('stageTipPack cache hit', {
				stamp: cacheStamp,
				files: n,
			});
			return n;
		}
		if (n > 0 && !hasBrand) {
			diagWarn(
				'stageTipPack cache missing brand.json — refetch',
				{ stamp: cacheStamp, files: n },
			);
		} else {
			diagWarn('stageTipPack cache empty — refetch');
		}
	}

	const bases = [...new Set(packBases.filter((b) => !!b))];
	let lastStatus = 'none';
	for (const wasmBase of bases) {
		onStatus?.('Updating…', 90);
		const listUrl = wasmUrl(wasmBase, `mods/${CLIENT_PACK_ID}.files`, stamp);
		const listRes = await fetch(listUrl);
		if (!listRes.ok) {
			const modUrl = wasmUrl(wasmBase, `mods/${CLIENT_PACK_ID}/mod.json`, stamp);
			const modRes = await fetch(modUrl);
			lastStatus = `${listRes.status}/${modRes.status}@${wasmBase}`;
			if (!modRes.ok) continue;
			const bytes = new Uint8Array(await modRes.arrayBuffer());
			await writePack(`/mods/${CLIENT_PACK_ID}/mod.json`, bytes);
			if (cacheStamp) {
				await writeOpfsFile(`${PACK_CACHE_ROOT}/mod.json`, bytes);
				await writeOpfsFile(
					`${PACK_CACHE_ROOT}/.stamp`,
					new TextEncoder().encode(cacheStamp),
				);
			}
			diag('stageTipPack base', { wasmBase, files: 1 });
			return 1;
		}
		const text = (await listRes.text()).replace(/\r\n/g, '\n').trim();
		const files = text
			.split(/\n/)
			.map((l) => l.trim())
			.filter((l) => l && !l.startsWith('#'))
			.filter((l) => !l.startsWith('native/') && !l.startsWith('lib/'));
		if (files.length === 0) throw new Error(`mods/${CLIENT_PACK_ID}.files is empty`);
		let n = 0;
		for (const rel of files) {
			if (!rel) continue;
			const url = wasmUrl(wasmBase, `mods/${CLIENT_PACK_ID}/${rel}`, stamp);
			const res = await fetch(url);
			if (!res.ok) throw new Error(`pack file HTTP ${res.status}: ${rel}`);
			const data = new Uint8Array(await res.arrayBuffer());
			await writePack(`/mods/${CLIENT_PACK_ID}/${rel}`, data);
			if (cacheStamp) {
				await writeOpfsFile(`${PACK_CACHE_ROOT}/${rel}`, data);
			}
			n += 1;
			if (n % 16 === 0)
				onStatus?.('Updating…', 90 + Math.min(5, n / 40));
		}
		if (cacheStamp) {
			await writeOpfsFile(
				`${PACK_CACHE_ROOT}/.stamp`,
				new TextEncoder().encode(cacheStamp),
			);
		}
		diagFlush('stageTipPack base', {
			wasmBase,
			files: n,
			cached: !!cacheStamp,
		});
		return n;
	}
	throw new Error(`mods/${CLIENT_PACK_ID} missing on tip (HTTP ${lastStatus})`);
}

function crashText(text: string | undefined): string {
	const detail = (text ?? '').trim();
	if (!detail) return 'The game stopped unexpectedly. Reload to try again.';
	// Emscripten abort(code) arrives as digits. Keep the code; the console
	// still has the Aborted(...) line from the runtime.
	if (/^\d+$/.test(detail))
		return `The game stopped unexpectedly (${detail}). Reload to try again.`;
	return detail;
}

type QtSuspendResumeControl = {
	asyncifyEnabled?: boolean;
	pendingEvents?: unknown[];
	eventHandlers?: Record<string | number, unknown>;
	__qtcSending?: boolean;
	__qtcJspiPatch?: number;
};

/**
 * JSPI + qtclient-fs: Qt queues DOM events on Module.qtSuspendResumeControl while
 * wasm is suspended in EM_ASYNC_JS (outside processEvents). C++ then Emval-reads
 * pendingEvents via length/shift/index — a stale handler index hits end()
 * iterator (release Q_ASSERT is a no-op) → memory-access OOB after login mask.
 *
 * Compact the JS queue so length/shift only expose live handlers. Control is
 * assigned during callMain — install a setter so the patch lands immediately.
 */
function patchQtSuspendResumeForJspi(instance: TibiaModule): void {
	const mod = instance as TibiaModule & {
		qtSuspendResumeControl?: QtSuspendResumeControl;
		__qtcQtSuspendHook?: number;
	};
	if (mod.__qtcQtSuspendHook) return;
	mod.__qtcQtSuspendHook = 1;

	const apply = (control: QtSuspendResumeControl | undefined | null): void => {
		if (!control || control.__qtcJspiPatch) return;
		control.__qtcJspiPatch = 1;
		control.asyncifyEnabled = true;

		// C++ sendPendingEvents (qt5-cip) now skips stale indexes / single-flights.
		// Keep asyncifyEnabled latched so DOM handlers queue instead of re-entering
		// wasm outside processEvents while qtclient-fs EM_ASYNC_JS is suspended.
		diag('qt suspend/resume JSPI patch', {
			asyncify: !!control.asyncifyEnabled,
		});
	};

	apply(mod.qtSuspendResumeControl);
	try {
		let current = mod.qtSuspendResumeControl;
		Object.defineProperty(mod, 'qtSuspendResumeControl', {
			configurable: true,
			enumerable: true,
			get: () => current,
			set: (v: QtSuspendResumeControl) => {
				current = v;
				apply(v);
			},
		});
	} catch {
		/* Module property may be non-configurable — apply() on existing only */
	}
}

function softLauncherCdnBase(assetBase: string): string {
	// Soft launcher QNAM is CORS/PNA-fragile against loopback tip hosts
	// (Cache-Control preflight from AlwaysNetwork). Same-origin /play/tip
	// proxy keeps Module tip GETs on the portal origin; portal fetch still
	// uses the absolute tip for IDB/OPFS bootstrap.
	try {
		const u = new URL(assetBase, location.origin);
		if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
			return `${location.origin}/play/tip`;
		}
	} catch {
		/* keep absolute tip */
	}
	return assetBase.replace(/\/+$/, '');
}

function loginEnvironment(opts: TibiaBootOptions): Record<string, string> {
	// env > tip mods/<pack>/mod.json > CIP fallbacks. Always pin login to the
	// play origin so a tip pack that still has local loginBase (CI stamp miss)
	// cannot POST to 127.0.0.1 from production /play.
	const origin = new URL(location.origin);
	const tipCdn = softLauncherCdnBase(opts.assetBase);
	const env: Record<string, string> = {
		QTCLIENT_CLIENT_REVISION: opts.revision,
		QTCLIENT_ASSET_BASE: tipCdn,
		QTCLIENT_CDN_URL: tipCdn,
		QTCLIENT_PORTAL_URL: location.origin,
		QTCLIENT_LOGIN_SCHEME: origin.protocol.replace(/:$/, '') || 'https',
		QTCLIENT_LOGIN_HOST: origin.hostname,
		QTCLIENT_LOGIN_PATH: '/clientservices/loginservice.php',
		QTCLIENT_CLIENTSERVICES_PATH: '/clientservices/clientservices.php',
		QTCLIENT_CREATE_ACCOUNT_PATH:
			'/clientservices/accountcreationclientservices.php',
	};
	if (origin.port) env.QTCLIENT_LOGIN_PORT = origin.port;
	if (opts.skipLauncher) env.QTCLIENT_WASM_SKIP_LAUNCHER = '1';
	// Isolation / fallback: ?qtclient_renderer=software|opengl overrides the
	// CIP options renderer before QGuiApplication (see rendererFromArgs).
	try {
		const q = new URLSearchParams(location.search);
		const r = q.get('qtclient_renderer');
		if (r) env.QTCLIENT_RENDERER = r;
	} catch {
		/* ignore */
	}
	// Pack-specific client env (e.g. per-browser render defaults).
	try {
		Object.assign(env, playEnv());
	} catch (err) {
		diagWarn('pack playEnv failed', {
			err: err instanceof Error ? err.message : String(err),
		});
	}
	// Stage writes /mods/<pack>; without this, tipModsRoots can pick
	// "/../mods/<pack>" on WASM ("/" + ../mods) and product chrome misses.
	if (CLIENT_PACK_ID) env.QTCLIENT_MODS_DIR = `/mods/${CLIENT_PACK_ID}`;
	// Soft launcher QNAM must use /content/<aa>/<hash> on CDN tips (local
	// :9080 or your static host). Default auto-detect only matches
	// qtclient.local / example.invalid.
	env.QTCLIENT_CDN_CONTENT_STORE = '1';
	return env;
}

export function bootTibia(callbacks: TibiaBootOptions): TibiaBootHandle {
	if (otcWasmAlreadyLoaded()) {
		diagWarn('WASM already loaded — remount reload');
		return reloadForOtcRemount('WASM already loaded');
	}
	clearOtcRemountCount();

	const launcherEngine = callbacks.engine === 'launcher';
	const jsName = launcherEngine ? 'launcher.js' : 'tibia.js';
	const wasmName = launcherEngine ? 'launcher.wasm' : 'tibia.wasm';
	const idbPackage = launcherEngine ? PACKAGE_LAUNCHER : PACKAGE_CLIENT;
	const scriptAttr = launcherEngine ? 'launcher' : 'tibia';

	quietWebGlPolygonModeWarn();
	diag('bootTibia', {
		engine: launcherEngine ? 'launcher' : 'tibia',
		skipLauncher: !!callbacks.skipLauncher,
		revision: callbacks.revision || null,
		engineStamp: callbacks.engineStamp || null,
	});

	const bag = createListenerBag();
	const wasmHeapSnap = (): Record<string, number | null> => {
		try {
			const g = globalThis as unknown as {
				Module?: { HEAPU8?: Uint8Array; wasmMemory?: WebAssembly.Memory };
			};
			const heap = g.Module?.HEAPU8;
			const buf = g.Module?.wasmMemory?.buffer;
			return {
				heapLen: heap?.byteLength ?? null,
				memBuf: buf?.byteLength ?? null,
			};
		} catch {
			return { heapLen: null, memBuf: null };
		}
	};
	bag.listen(window, 'error', ((ev: ErrorEvent) => {
		reportBrowserCrash({
			name: ev.error instanceof Error ? ev.error.name : 'Error',
			message: ev.message || 'window.onerror',
			stack: ev.error instanceof Error ? ev.error.stack : `${ev.filename}:${ev.lineno}:${ev.colno}`,
			stage: 'window.onerror',
			revision: callbacks.revision,
		});
		diagWarn('window.onerror', {
			message: ev.message,
			source: ev.filename,
			line: ev.lineno,
			col: ev.colno,
			stack: ev.error instanceof Error ? ev.error.stack?.slice(0, 2500) : null,
			...wasmHeapSnap(),
		});
	}) as EventListener);
	bag.listen(window, 'unhandledrejection', ((ev: PromiseRejectionEvent) => {
		const reason = ev.reason;
		reportBrowserCrash({
			name: reason instanceof Error ? reason.name : 'UnhandledRejection',
			message: reason instanceof Error ? reason.message : String(reason),
			stack: reason instanceof Error ? reason.stack : null,
			stage: 'unhandledrejection',
			revision: callbacks.revision,
		});
		diagWarn('unhandledrejection', {
			err:
				reason instanceof Error
					? `${reason.name}: ${reason.message}`
					: String(reason),
			stack: reason instanceof Error ? reason.stack?.slice(0, 2500) : null,
			...wasmHeapSnap(),
		});
	}) as EventListener);
	const stage = document.getElementById('play-stage');
	if (!stage) {
		callbacks.onFatal?.('Missing #play-stage');
		return { destroy: () => undefined };
	}

	// Login-ready handshake for the portal overlay. Under JSPI, qtLoad resolves
	// on the park race (not when main returns). C++ calls
	// window.__qtclientGameUiReady immediately before application.exec; print
	// fallback must match that — "waiting for account login" fires mid-boot
	// (before DepotSearch/Chat/exec) and must not clear the overlay early.
	let gameUiReadyFired = false;
	const fireGameUiReady = (source: string) => {
		if (gameUiReadyFired || launcherEngine) return;
		gameUiReadyFired = true;
		diag('bootTibia gameUiReady', { source, skipLauncher: !!callbacks.skipLauncher });
		callbacks.onGameReady?.();
	};
	const prevGameUiReady = (
		window as Window & { __qtclientGameUiReady?: () => void }
	).__qtclientGameUiReady;
	(
		window as Window & { __qtclientGameUiReady?: () => void }
	).__qtclientGameUiReady = () => {
		try {
			prevGameUiReady?.();
		} catch {
			/* ignore */
		}
		fireGameUiReady('__qtclientGameUiReady');
	};
	bag.defer(() => {
		const w = window as Window & { __qtclientGameUiReady?: () => void };
		if (w.__qtclientGameUiReady && !prevGameUiReady) delete w.__qtclientGameUiReady;
		else w.__qtclientGameUiReady = prevGameUiReady;
	});
	// Qt qInfo on WASM often hits console.log, not Module.print — watch both
	// until the first ready signal (C++ EM_ASM is the durable path).
	const origConsoleLog = console.log.bind(console);
	console.log = (...args: unknown[]) => {
		origConsoleLog(...args);
		if (gameUiReadyFired || launcherEngine) return;
		const text = args.map(String).join(' ');
		if (/entering application\.exec/i.test(text)) {
			fireGameUiReady('console.log');
		}
	};
	bag.defer(() => {
		console.log = origConsoleLog;
	});

	const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
	// Optional Module.canvas backbuffer. Hide visually — Qt paints into
	// `#tibia-screen` containerElements (main-thread JSPI game Module).
	if (canvas) canvas.style.display = 'none';

	const screen = document.createElement('div');
	screen.id = 'tibia-screen';
	Object.assign(screen.style, {
		position: 'absolute',
		inset: '0',
		width: '100%',
		height: '100%',
		// Transparent so CipSoft BackgroundImage on #play-stage shows through
		// until QML paints (avoids a solid black layer under the transition).
		background: 'transparent',
		zIndex: '2',
	} as CSSStyleDeclaration);
	stage.appendChild(screen);
	bag.defer(() => screen.remove());
	// Pinch / ctrl+wheel CSS magnify — does not resize the Qt play box.
	bag.defer(attachViewMagnify(screen));
	// WebAudio starts suspended. Resume from the click itself; a Qt event
	// delivered later is no longer a user gesture and the browser ignores it.
	const resumeAudio = () => {
		if ((window as unknown as { qtcSoundMuted?: boolean }).qtcSoundMuted)
			return;
		const root = (
			window as unknown as {
				miniaudio?: {
					devices?: { webaudio?: { state?: string; resume?: () => void } }[];
				};
			}
		).miniaudio;
		for (const device of root?.devices ?? []) {
			if (device.webaudio?.state === 'suspended') device.webaudio.resume?.();
		}
	};
	const onGamePointer = () => {
		resumeAudio();
	};
	screen.addEventListener('pointerdown', onGamePointer);
	bag.defer(() => screen.removeEventListener('pointerdown', onGamePointer));

	callbacks.onStatus?.(`Loading ${CLIENT_NAME}…`, 10);
	(
		window as unknown as { __QTCLIENT_OTC_LOADED?: boolean }
	).__QTCLIENT_OTC_LOADED = true;

	void (async () => {
		try {
			callbacks.onStatus?.(
				launcherEngine ? 'Loading qtclient…' : 'Loading client from package…',
				30,
			);
			diag(`IDB require ${jsName}/${wasmName}/qtloader`);
			const jsFile = await requireIdbFile(idbPackage, jsName);
			const wasmRow = await requireIdbFile(idbPackage, wasmName);
			const idbLoader = await requireIdbFile(idbPackage, 'qtloader.js');
			// qtloader is tiny and changes independently of the wasm stamp.
			// Prefer the tip file (stamp-busted) so IDB cannot retain the older
			// microtask-only JSPI detach after a tip qtloader bump.
			const tipLoaderUrl = wasmUrl(
				callbacks.wasmBase,
				'qtloader.js',
				callbacks.engineStamp,
			);
			let loaderBytes = idbLoader.bytes;
			let loaderSource: 'tip' | 'idb' = 'idb';
			try {
				const tipLoader = await fetch(tipLoaderUrl, { cache: 'no-cache' });
				if (tipLoader.ok) {
					const buf = await tipLoader.arrayBuffer();
					if (buf.byteLength > 0) {
						loaderBytes = buf;
						loaderSource = 'tip';
					}
				}
			} catch {
				/* keep IDB loader */
			}
			diag('IDB engine bytes', {
				engine: launcherEngine ? 'launcher' : 'tibia',
				js: jsFile.bytes.byteLength,
				wasm: wasmRow.bytes.byteLength,
				loader: loaderBytes.byteLength,
				loaderSource,
				tipLoaderUrl,
			});
			callbacks.onStatus?.(
				launcherEngine ? 'Loading qtclient…' : 'Loading client…',
				45,
			);
			const tipEngineJs = wasmUrl(
				callbacks.wasmBase,
				jsName,
				callbacks.engineStamp,
			);
			const engineDir = sameOriginEngineDir(tipEngineJs);
			// Patch pool size to 0 and load from a same-origin Blob so
			// createWasm does not wait on 8 Worker script fetches (hangs on
			// Vite/Electron; bare tip static server does not).
			let patchedJs = patchPthreadPoolSize(jsFile.bytes);
			patchedJs = patchSkipFetchIdb(patchedJs);
			patchedJs = patchJspiPromisingWrap(patchedJs);
			patchedJs = patchEmvalGetPropertyGuard(patchedJs);
			patchedJs = patchWasmInitialMemory(patchedJs);
			diag('engine script', {
				tipEngineJs,
				engineDir,
				jsBytes: patchedJs.byteLength,
				wasmBytes: wasmRow.bytes.byteLength,
				pthreadPoolPatched: true,
				fetchIdbSkipped: true,
				qtclientFs: 'jspi',
			});
			const engineScript = await loadScriptFromBytes(patchedJs, scriptAttr);
			diag(`${jsName} script loaded`);
			callbacks.onStatus?.(
				launcherEngine ? 'Starting qtclient…' : 'Starting client…',
				55,
			);
			const patchedLoader = patchQtLoaderJspiCallMain(loaderBytes);
			await loadScriptFromBytes(patchedLoader);
			diag('qtloader.js script loaded', {
				loaderSource,
				bytes: patchedLoader.byteLength,
				parked: new TextDecoder()
					.decode(patchedLoader)
					.includes('__qtcMainPark'),
			});
			callbacks.onStatus?.('Preparing session…', 70);
			diag('WebAssembly.compile start', {
				wasmBytes: wasmRow.bytes.byteLength,
			});
			const wasmModule = await WebAssembly.compile(wasmRow.bytes);
			diag('WebAssembly.compile done');

			const entry = launcherEngine ? window.launcher_entry : window.tibia_entry;
			if (typeof window.qtLoad !== 'function' || typeof entry !== 'function') {
				throw new Error(
					`${jsName} / qtloader.js did not export qtLoad / ${launcherEngine ? 'launcher_entry' : 'tibia_entry'}`,
				);
			}

			const mainScriptUrlOrBlob = engineScript.url;
			diag('qtLoad start', {
				engine: launcherEngine ? 'launcher' : 'tibia',
				mainScriptUrlOrBlob: `blob(${patchedJs.byteLength})`,
				engineDir,
				tipEngineJs,
			});

			const prepareInstance = async (
				instance: TibiaModule,
				config: unknown,
			): Promise<TibiaModule> => {
				callbacks.onStatus?.('Preparing…', 80);
				// Soft + game: scaffold first, stage OPFS, then qtclient-fs Worker.
				// Safari InvalidStateError if createWritable races SyncAccessHandles.
				const markHydrated = () => {
					const mod = instance as TibiaModule & {
						qtclientPortalHydratedTip?: number;
					};
					mod.qtclientPortalHydratedTip = 1;
					(
						globalThis as unknown as { qtclientPortalHydratedTip?: number }
					).qtclientPortalHydratedTip = 1;
					try {
						(
							globalThis as unknown as { Module?: { qtclientPortalHydratedTip?: number } }
						).Module && ((
							globalThis as unknown as { Module: { qtclientPortalHydratedTip?: number } }
						).Module.qtclientPortalHydratedTip = 1);
					} catch {
						/* Module may be non-configurable */
					}
				};
				markHydrated();
				await prepareBrowserTipScaffold(instance, callbacks.onStatus);
				markHydrated();
				// Tip-fs first: staging + QFile share SyncAccessHandle (lazy open).
				// Avoid Safari createWritable NoModificationAllowedError.
				await mountQtclientFsBridge(instance);
				markHydrated();
				if (CLIENT_PACK_ID) {
					try {
						instance.FS.mkdirTree(`/user/.${CLIENT_PACK_ID}`);
					} catch (err) {
						diagWarn('mkdir pack user dir failed', {
							err: err instanceof Error ? err.message : String(err),
						});
					}
				}
				diag('prepareInstance after qtclient-fs', {
					qtclientFs: 1,
					pkgs: (() => {
						try {
							return instance.FS.readdir(
								`${CIP_APPDATA}/packages`,
							);
						} catch (e) {
							return String(e);
						}
					})(),
				});
				const skipLauncher =
					!launcherEngine &&
					(callbacks.skipLauncher ||
						(config as { getenv?: (k: string) => string | null })?.getenv?.(
							'QTCLIENT_WASM_SKIP_LAUNCHER',
						) === '1' ||
						(
							instance as {
								ENV?: Record<string, string>;
							}
						).ENV?.QTCLIENT_WASM_SKIP_LAUNCHER === '1');
				// Never mirror sprite bulk onto /Contents — qtclient and game both
				// resolve packages/<client>/Contents/Resources (14k-file copy
				// jetsams Safari on qtclient boot after a successful pack install).
				// installPackageTree only counts tip files (no copy). Skip the
				// walk on WasmFS — deep readdir/stat has aborted with "FS error".
				let n = 0;
				if (callbacks.store) {
					n = await callbacks.store.writeToFS(instance.FS);
				} else if (launcherEngine) {
					try {
						n = installPackageTree(instance.FS, PACKAGE_ROOT, {
							essentialsOnly: true,
						});
					} catch (err) {
						diagWarn('installPackageTree failed', {
							err: err instanceof Error ? err.message : String(err),
						});
					}
				}
				diag('installPackageTree', {
					files: n,
					essentialsOnly: true,
					launcherEngine,
					skipLauncher: !!skipLauncher,
					portalHydratedTip: true,
					canvas: !!canvas && !launcherEngine,
				});
				const packBases = [
					callbacks.packWasmBase ?? '',
					// Game tip carries mods/<pack>; qtclient tip does not.
					launcherEngine ? '' : callbacks.wasmBase,
					callbacks.revision
						? tipUrl(
								callbacks.assetBase,
								`client/${callbacks.revision}/wasm`,
							)
						: '',
				];
				try {
					const staged = CLIENT_PACK_ID
						? await stageTipPack(
								instance.FS,
								packBases,
								callbacks.engineStamp,
								callbacks.onStatus,
							)
						: 0;
					diag('stageTipPack', { files: staged });
					applyProductPlayCss({
						assetBase: callbacks.assetBase,
						packWasmBase: callbacks.packWasmBase,
						engineStamp: callbacks.engineStamp,
					});
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					diagWarn('tip pack stage failed', { msg });
					callbacks.onFatal?.(`Couldn't stage tip pack: ${msg}`);
					throw err;
				}
				// Before callMain: qtclient stages essentials only; game-only
				// verifies tip Cip tree and throws if incomplete.
				try {
					await syncThingsFromCdn(
						instance.FS,
						callbacks.assetBase,
						callbacks.onStatus,
						// skipLauncher: install packs if OPFS is cold (verify alone
						// fails when sprites/minimap were never downloaded).
						skipLauncher ? 'install' : 'essentials',
					);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					diagWarn('syncThings before callMain failed', { msg });
					callbacks.onFatal?.(`Couldn't sync game assets: ${msg}`);
					throw err;
				}
				try {
					ensureQtclientHostPackageAlias(instance.FS, PACKAGE_ROOT);
				} catch (err) {
					diagWarn('host package alias failed', {
						err: err instanceof Error ? err.message : String(err),
					});
				}
				try {
					await ensureSpellsExtrasFromCdn(
						instance.FS,
						PACKAGE_ROOT,
						callbacks.assetBase,
					);
				} catch (err) {
					diagWarn('spells extras stage failed', {
						err: err instanceof Error ? err.message : String(err),
					});
				}
				try {
					await ensureQtclientBootAssetsFromPackage(
						instance.FS,
						PACKAGE_ROOT,
					);
				} catch (err) {
					diagWarn('boot assets mirror failed', {
						err: err instanceof Error ? err.message : String(err),
					});
				}
				// Flush any leftover portal writers; drop staging handles so
				// callMain opens tip files lazily on demand.
				await freezeTipForWasmHandoff({
					soft: launcherEngine,
					onStatus: callbacks.onStatus,
				});
				await releaseQtclientFsHandlesForPortalWrites();
				markHydrated();
				diag('tip ready → callMain (skip WasmFS remount)', {
					home: CIP_HOME,
					packageRoot: PACKAGE_ROOT,
					qtclientFs: 1,
				});
				callbacks.onStatus?.(
					launcherEngine ? 'Launching qtclient…' : 'Launching client…',
					95,
				);
				diag('returning instance to qtLoad (callMain next)');
				if (launcherEngine) callbacks.onLauncherReady?.();
				// Tip-print fallback for gameUiReady (pre-EM_ASM tips).
				if (!launcherEngine) {
					const inst = instance as {
						print?: (...args: unknown[]) => void;
						printErr?: (...args: unknown[]) => void;
					};
					const wrapPrint =
						(prev?: (...args: unknown[]) => void) =>
						(...args: unknown[]) => {
							try {
								prev?.(...args);
							} catch {
								/* ignore */
							}
							const text = args.map(String).join(' ');
							if (/entering application\.exec/i.test(text)) {
								fireGameUiReady('module.print');
							}
						};
					inst.print = wrapPrint(inst.print?.bind(instance));
					inst.printErr = wrapPrint(inst.printErr?.bind(instance));
				}
				patchQtSuspendResumeForJspi(instance);
				// Capture abort / callMain rejection stacks for post-login OOB.
				try {
					const prevAbort = (instance as { onAbort?: (r: unknown) => void })
						.onAbort;
					(instance as { onAbort?: (r: unknown) => void }).onAbort = (
						reason,
					) => {
						reportBrowserCrash({
							name: 'WasmAbort',
							message: reason instanceof Error ? reason.message : String(reason),
							stack:
								reason instanceof Error
									? reason.stack
									: new Error(String(reason)).stack,
							stage: 'wasm.onAbort',
							revision: callbacks.revision,
							extra: wasmHeapSnap(),
						});
						diagWarn('wasm onAbort', {
							reason:
								reason instanceof Error ? reason.message : String(reason),
							stack:
								reason instanceof Error
									? reason.stack?.slice(0, 3500)
									: new Error(String(reason)).stack?.slice(0, 3500),
							...wasmHeapSnap(),
						});
						try {
							prevAbort?.(reason);
						} catch {
							/* ignore */
						}
					};
				} catch {
					/* Module may seal onAbort */
				}
				try {
					const inst = instance as {
						callMain?: (args?: string[]) => unknown;
					};
					const prevMain = inst.callMain?.bind(instance);
					if (prevMain) {
						inst.callMain = async (args?: string[]) => {
							try {
								return await prevMain(args);
							} catch (err) {
								diagWarn('callMain throw', {
									name: err instanceof Error ? err.name : null,
									message:
										err instanceof Error ? err.message : String(err),
									stack:
										err instanceof Error
											? err.stack?.slice(0, 3500)
											: null,
									...wasmHeapSnap(),
								});
								throw err;
							}
						};
					}
				} catch {
					/* ignore */
				}
				return instance;
			};

			// qtLoad calls entry then callMain. We must prepare FS after
			// createWasm resolves and before callMain — wrap entry, but keep
			// the createWasm path identical to bare tibia.html (no module /
			// no mainScriptUrlOrBlob; env applied in qtloader preRun).
			const qtModule = await window.qtLoad({
				locateFile: (path) => {
					if (path.includes('://') || path.startsWith('/')) return path;
					// Worker JS may use same-origin em-pthread; preloaded
					// .wasm/.data must not — that proxy 404s non-JS and hung
					// /play on "Preparing session…" (unhandled 404 rejection).
					const base =
						engineDir && /\.js$/i.test(path)
							? engineDir
							: callbacks.wasmBase;
					return wasmUrl(base, path, callbacks.engineStamp);
				},
				mainScriptUrlOrBlob,
				// Do NOT use qt.module — qtloader's `async instantiateWasm`
				// returns a Promise that Emscripten waits on forever while also
				// using successCallback (runDeps stuck at wasm-instantiate).
				instantiateWasm: (
					imports: WebAssembly.Imports,
					receiveInstance: (
						instance: WebAssembly.Instance,
						module: WebAssembly.Module,
					) => void,
				) => {
					diag('instantiateWasm start');
					// instantiate(Module) resolves to an Instance (not ResultObject).
					void WebAssembly.instantiate(wasmModule, imports)
						.then((instance) => {
							diag('instantiateWasm ok');
							receiveInstance(instance, wasmModule);
						})
						.catch((err: unknown) => {
							diagWarn('instantiateWasm fail', {
								err: err instanceof Error ? err.message : String(err),
							});
						});
					// Important: return nothing (not a Promise).
				},
				qt: {
					entryFunction: async (config) => {
						diag(`${launcherEngine ? 'launcher' : 'tibia'}_entry start`);
						const t0 = performance.now();
						const instance = await entry(config);
						diag(`${launcherEngine ? 'launcher' : 'tibia'}_entry done`, {
							ms: Math.round(performance.now() - t0),
						});
						return prepareInstance(instance, config);
					},
					containerElements: [screen],
					environment: loginEnvironment({
						...callbacks,
						skipLauncher: launcherEngine ? false : callbacks.skipLauncher,
					}),
					onLoaded: () => {
						diag('qt onLoaded', { launcherEngine });
						callbacks.onStatus?.('Ready', 100);
						callbacks.onReady?.();
					},
					onExit: (exit) => {
						diagWarn('qt onExit', {
							code: exit.code,
							crashed: exit.crashed,
							text: exit.text,
							...wasmHeapSnap(),
						});
						const msg = exit.crashed
							? crashText(exit.text)
							: `Application exit${exit.code !== undefined ? ` (${exit.code})` : ''}`;
						callbacks.onFatal?.(msg);
					},
				},
			});
			// Pin Module across JSPI suspend — otherwise GC can drop the
			// ~100MB wasm instance and the game vanishes silently.
			const g = globalThis as unknown as {
				Module?: TibiaModule;
				__qtcQtModule?: TibiaModule;
			};
			g.Module = qtModule as TibiaModule;
			g.__qtcQtModule = qtModule as TibiaModule;
			bag.defer(() => {
				if (g.__qtcQtModule === qtModule) delete g.__qtcQtModule;
			});
			diag('qtLoad resolved', {
				launcherEngine,
				pinned: true,
				memMb: (() => {
					try {
						const m = (
							performance as Performance & {
								memory?: { usedJSHeapSize?: number };
							}
						).memory;
						return m?.usedJSHeapSize
							? Math.round(m.usedJSHeapSize / (1024 * 1024))
							: null;
					} catch {
						return null;
					}
				})(),
			});
			// Soft launcher only: game Module signals via __qtclientGameUiReady
			// (or console/print fallback at entering application.exec). Under
			// JSPI, qtLoad can resolve as soon as entryFunction returns — far
			// before the login mask paints.
			if (launcherEngine) fireGameUiReady('qtLoad.resolved');
		} catch (err) {
			const raw = err instanceof Error ? err.message : String(err);
			diagWarn('bootTibia catch', {
				raw,
				name: err instanceof Error ? err.name : null,
				stack: err instanceof Error ? err.stack?.slice(0, 3500) : null,
				...wasmHeapSnap(),
			});
			callbacks.onFatal?.(crashText(raw));
		}
	})();

	return {
		destroy: () => {
			bag.dispose();
			if (canvas) (canvas as HTMLElement).style.display = '';
		},
	};
}
