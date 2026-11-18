/**
 * Browser boot for the qtclient wasm engines on /play (launcher + game).
 * Loads the engine glue + qtloader into the /play document (no iframe), hands
 * stages the tip pack, then starts main (which mounts OPFS with its own Worker).
 */
import { playEnv } from '$pack/play.client';

import {
	CIP_HOME,
	CLIENT_NAME,
	CLIENT_PACK_ID,
	PACKAGE_LAUNCHER,
	isInstalledProgram,
	packageFsRoot,
} from './cip-fs.js';
import {
	ensurePackage,
	type PackageProgress,
	readEngineFile,
} from './cip-package.js';
import {
	detectBrowser,
	reportBrowserGate,
	unsupportedBrowserMessage,
} from './browser-floor';
import { reportBrowserCrash } from './crash-report';
import { closeOpfsWriter } from './opfs.js';
import { createListenerBag } from './otc/dom-util';
import {
	clearOtcRemountCount,
	OTC_SCRIPT_ATTR,
	otcWasmAlreadyLoaded,
	reloadForOtcRemount,
} from './otc/wasm-guard';
import { diag, diagWarn } from './play-diag';
import { attachViewMagnify } from './view-magnify';

/** The client package the launcher installs (tip `directoryname`). */

/**
 * sessionStorage: qtclient Play → game remount (Emscripten cannot re-init in-page).
 * Must match LauncherWindow::play() EM_ASM keys.
 */
export const PLAY_HANDOFF_KEY = 'tibia.play';
/** Keep the launching overlay across the remount navigation. */
export const PLAY_TRANSITION_KEY = 'tibia.play.transition';

export type TibiaBootOptions = {
	/**
	 * Tip dir with engine bytes + qtloader.js.
	 * qtclient: launcher.{js,wasm}; game: tibia.{js,wasm,data?}.
	 */
	wasmBase: string;
	revision: string;
	/** Busts the browser engine cache after a local wasm rebuild. */
	engineStamp?: string;
	assetBase: string;
	/**
	 * Which engine package / Emscripten entry to boot.
	 * `launcher` = CipSoft's launcher (Widgets); game = `tibia` (QML).
	 */
	engine?: 'launcher' | 'tibia';
	/**
	 * qtclient Play remount or warm InstalledAndUsable tip: skip qtclient Widgets,
	 * boot game UI only (`QTCLIENT_WASM_SKIP_LAUNCHER=1`). Only for `engine: 'tibia'`.
	 */
	skipLauncher?: boolean;
	/**
	 * The client program the launcher started (`engine: 'tibia'`): argv[0], and
	 * its directory holds tibia.wasm / tibia.data / qtloader.js.
	 */
	clientProgram?: string;
	onStatus?: (text: string, progress: number) => void;
	/** WASM Module onLoaded — may fire before tip page-in / callMain. */
	onReady?: () => void;
	/**
	 * Launcher: entryFunction finished (essentials + pack staged, callMain next).
	 * Prefer this over onReady to drop the portal overlay.
	 */
	onLauncherReady?: () => void;
	/**
	 * Game-only: login UI is up (C++ `window.__qtclientGameUiReady`).
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
	ENV?: Record<string, string>;
	callMain: (args?: string[]) => void;
	/** qtclient browser/qtclient-fs.js — the engine's OPFS Worker. */
	qtclientFs?: { stats(): Promise<QtclientFsWorkerStats> };
	/** browser/wasm_heap_stats.cpp — publishes Module.qtclientHeap. */
	_qtclient_heap_stats_publish?: () => void;
	qtclientHeap?: Record<string, number>;
	/** browser/qtclient_opfs_backend.cpp — publishes Module.qtclientFsMain. */
	_qtclient_fs_stats_publish?: () => void;
	/** Main-thread file system calls and the time main spent in them. */
	qtclientFsMain?: { calls: number; ms: number };
};

type QtclientFsWorkerStats = {
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

type QtLoadConfig = {
	locateFile?: (path: string) => string;
	/**
	 * Emscripten pthread Workers call `new Worker(scriptUrl)`. Prefer a Blob of
	 * tibia.js (same-origin) or a same-origin `/play/em-pthread/…` URL string.
	 * Avoid leaving a cross-origin tip URL here — Classic Workers reject it
	 * even with CORS.
	 */
	mainScriptUrlOrBlob?: string | Blob;
	/** Emscripten argv[0]: Qt's applicationFilePath() (must exist). */
	thisProgram?: string;
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
 * The program the launcher started (its `startDetached` on the web stores the
 * path, from the client package's `executable`), or null to boot the launcher.
 */
export function takePlayHandoff(): string | null {
	try {
		const program = sessionStorage.getItem(PLAY_HANDOFF_KEY);
		sessionStorage.removeItem(PLAY_HANDOFF_KEY);
		return program && isInstalledProgram(program) ? program : null;
	} catch {
		return null;
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
 * Install the launcher package (launcher.js / .wasm: CipSoft's launcher, the
 * same classes as desktop) into OPFS packages/LAUNCHER/ for /play.
 */
export async function bootstrapLauncherPackage(
	cdn: string,
	onProgress?: (p: PackageProgress) => void,
): Promise<{ version: string; fromCache: boolean }> {
	const base = tipUrl(cdn, 'launcher/launcher-web-current');
	return ensurePackage({
		packageName: PACKAGE_LAUNCHER,
		packageBase: base,
		onProgress,
	});
}

export async function loadScriptFromBytes(
	bytes: ArrayBuffer,
	attr?: string,
): Promise<{ url: string }> {
	const url = URL.createObjectURL(
		new Blob([bytes], { type: 'application/javascript' }),
	);
	await new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.async = true;
		if (attr) script.setAttribute(OTC_SCRIPT_ATTR, attr);
		script.src = url;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error('Failed to load script blob'));
		document.body.appendChild(script);
	});
	return { url };
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
		__qtclientDiag?: {
			mark?: (msg: string, data?: Record<string, unknown>) => void;
			dump?: () => unknown;
			flush?: () => void;
		};
	}
}

/**
 * Qt /play engines are built with `-sJSPI`. Emscripten's
 * `instrumentWasmImports` does `new WebAssembly.Suspending(...)` — Safari
 * added that in 27; iOS Safari ≤26.x throws and kills the tab. Feature-detect
 * before compiling the module so /play can show a clear message instead
 * (floor + advice: `browser-floor.ts`).
 */
export function wasmJspiSupported(): boolean {
	try {
		const WA = WebAssembly as typeof WebAssembly & {
			Suspending?: new (...args: unknown[]) => unknown;
			Function?: unknown;
		};
		return typeof WA.Suspending === 'function' || typeof WA.Function === 'function';
	} catch {
		return false;
	}
}

export function jspiUnsupportedMessage(): string {
	return unsupportedBrowserMessage(
		detectBrowser(navigator.userAgent, navigator.maxTouchPoints ?? 0),
	);
}

function wasmUrl(base: string, path: string, stamp?: string): string {
	const url = `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
	return stamp ? `${url}?v=${encodeURIComponent(stamp)}` : url;
}

/**
 * CipSoft BackgroundImage on #play-stage (+ transition shell). Call early on
 * /play so warm boots are not a black void while the engine loads.
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

function crashText(text: string | undefined): string {
	const detail = (text ?? '').trim();
	if (!detail) return 'The game stopped unexpectedly. Reload to try again.';
	// Emscripten abort(code) arrives as digits. Keep the code; the console
	// still has the Aborted(...) line from the runtime.
	if (/^\d+$/.test(detail))
		return `The game stopped unexpectedly (${detail}). Reload to try again.`;
	return detail;
}

function launcherCdnBase(assetBase: string): string {
	// Launcher QNAM is CORS/PNA-fragile against loopback tip hosts
	// (Cache-Control preflight from AlwaysNetwork). Same-origin /play/tip
	// proxy keeps Module tip GETs on the portal origin; portal fetch still
	// uses the absolute tip for the launcher package and pack staging.
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
	const tipCdn = launcherCdnBase(opts.assetBase);
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
		// The launcher's hardware survey, same origin as login (a stamped
		// www./apex site is cross-origin from the other host).
		QTCLIENT_SYSTEM_SURVEY_URL: `${location.origin}/clientservices/hardwarereceiver.php`,
	};
	if (origin.port) env.QTCLIENT_LOGIN_PORT = origin.port;
	if (opts.skipLauncher) env.QTCLIENT_WASM_SKIP_LAUNCHER = '1';
	// Isolation / fallback: ?qtclient_renderer=software|opengl overrides the
	// CIP options renderer before QGuiApplication (see rendererFromArgs).
	try {
		const q = new URLSearchParams(location.search);
		const r = q.get('qtclient_renderer');
		if (r) env.QTCLIENT_RENDERER = r;
		// Diagnostics: Qt logging rules, e.g. ?qtclient_log=tibia.download.debug=true
		// (the launcher's per-file download lines; off by default).
		const log = q.get('qtclient_log');
		if (log) env.QT_LOGGING_RULES = log.replaceAll(',', ';');
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
	// Both engines run from their installed package, argv[0] inside it: the
	// launcher's (the portal installs it, bootstrapLauncherPackage) and the
	// client's, at the path the launcher started (its package's `executable`).
	// applicationDirPath() is then the program's directory, as on desktop.
	const thisProgram = launcherEngine
		? `${packageFsRoot(PACKAGE_LAUNCHER)}/${jsName}`
		: callbacks.clientProgram;
	if (!thisProgram)
		throw new Error('No client program to start — open the launcher.');
	const engineFile = (name: string) => readEngineFile(thisProgram, name);
	const scriptAttr = launcherEngine ? 'launcher' : 'tibia';

	diag('bootTibia', {
		engine: launcherEngine ? 'launcher' : 'tibia',
		skipLauncher: !!callbacks.skipLauncher,
		revision: callbacks.revision || null,
		engineStamp: callbacks.engineStamp || null,
	});

	const bag = createListenerBag();
	// Wasm heap + qtclient-fs telemetry (MB). The heap is a fixed reservation;
	// mallocMaxFootprint is the number that sizes INITIAL_MEMORY.
	let liveModule: TibiaModule | null = null;
	const mb = (n: number | undefined) =>
		n === undefined ? null : Math.round((n / 1048576) * 10) / 10;
	const wasmHeapSnap = (): Record<string, unknown> => {
		const mod = liveModule;
		if (!mod?._qtclient_heap_stats_publish) return { heap: null };
		try {
			mod._qtclient_heap_stats_publish();
		} catch (err) {
			return {
				heap: `unavailable: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
		const h = mod.qtclientHeap ?? {};
		return {
			heapMb: {
				reserved: mb(h.reserved),
				sbrkTop: mb(h.sbrkTop),
				inUse: mb(h.mallocInUse),
				footprint: mb(h.mallocFootprint),
				maxFootprint: mb(h.mallocMaxFootprint),
				stack: mb(h.stackSize),
			},
		};
	};
	/** Heap snapshot + the engine's qtclient-fs Worker counters. */
	const logHeapAndFs = async (label: string) => {
		const snap = wasmHeapSnap();
		try {
			const fs = liveModule?.qtclientFs;
			if (!fs) throw new Error('engine has no qtclient-fs');
			const w = await fs.stats();
			const top = Object.entries(w.stats.byOp)
				.sort((a, b) => b[1].ms - a[1].ms)
				.slice(0, 6)
				.map(([op, v]) => `${op}:${v.calls}/${Math.round(v.ms)}ms`);
			// Main-thread time in file system calls (JSPI included): what the
			// app feels, next to the Worker's own per-op counters.
			liveModule?._qtclient_fs_stats_publish?.();
			const m = liveModule?.qtclientFsMain;
			const mainLine = m
				? ` | main wait ${Math.round(m.ms)}ms over ${m.calls} calls`
				: '';
			// Numbers in the message itself: Safari's console collapses the
			// data object to "Object" when logs are copied.
			const h = (snap.heapMb ?? {}) as Record<string, number | null>;
			const line =
				`heap inUse=${h.inUse}MB maxFootprint=${h.maxFootprint}MB sbrkTop=${h.sbrkTop}MB ` +
				`reserved=${h.reserved}MB | fs calls=${w.stats.calls} ms=${Math.round(w.stats.ms)} ` +
				`read=${mb(w.stats.bytesRead)}MB written=${mb(w.stats.bytesWritten)}MB ` +
				`handles=${w.openHandles} | top ${top.join(' ')}${mainLine}`;
			diag(`${label}: ${line}`, {
				...snap,
				fs: {
					calls: w.stats.calls,
					ms: Math.round(w.stats.ms),
					readMb: mb(w.stats.bytesRead),
					writtenMb: mb(w.stats.bytesWritten),
					openHandles: w.openHandles,
					idleHandles: w.idleHandles,
					nodes: w.nodes,
					top,
				},
			});
		} catch (err) {
			diag(label, {
				...snap,
				fs: `unavailable: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	};
	const startHeapDiag = (mod: TibiaModule) => {
		liveModule = mod;
		const timer = window.setInterval(() => void logHeapAndFs('heap'), 30_000);
		bag.defer(() => window.clearInterval(timer));
	};
	bag.listen(window, 'error', ((ev: ErrorEvent) => {
		reportBrowserCrash({
			name: ev.error instanceof Error ? ev.error.name : 'Error',
			message: ev.message || 'window.onerror',
			stack:
				ev.error instanceof Error
					? ev.error.stack
					: `${ev.filename}:${ev.lineno}:${ev.colno}`,
			stage: 'window.onerror',
			revision: callbacks.revision,
			extra: { engine: wasmName },
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
		const reason: unknown = ev.reason;
		reportBrowserCrash({
			name: reason instanceof Error ? reason.name : 'UnhandledRejection',
			message: reason instanceof Error ? reason.message : String(reason),
			stack: reason instanceof Error ? reason.stack : null,
			stage: 'unhandledrejection',
			revision: callbacks.revision,
			extra: { engine: wasmName },
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

	// Login-ready handshake for the portal overlay. Under JSPI qtLoad never
	// settles (main stays in application.exec); C++ calls
	// window.__qtclientGameUiReady immediately before application.exec.
	let gameUiReadyFired = false;
	const fireGameUiReady = (source: string) => {
		if (gameUiReadyFired || launcherEngine) return;
		gameUiReadyFired = true;
		diag('bootTibia gameUiReady', {
			source,
			skipLauncher: !!callbacks.skipLauncher,
		});
		void logHeapAndFs('heap at gameUiReady');
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
		if (w.__qtclientGameUiReady && !prevGameUiReady)
			delete w.__qtclientGameUiReady;
		else w.__qtclientGameUiReady = prevGameUiReady;
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
			if (!wasmJspiSupported()) {
				const info = detectBrowser(
					navigator.userAgent,
					navigator.maxTouchPoints ?? 0,
				);
				const msg = unsupportedBrowserMessage(info);
				diagWarn('JSPI unsupported', { ua: navigator.userAgent, ...info });
				reportBrowserGate({
					info,
					engine: launcherEngine ? 'launcher' : 'tibia',
					reason: 'no-jspi',
					revision: callbacks.revision,
				});
				callbacks.onFatal?.(msg);
				return;
			}
			callbacks.onStatus?.(
				launcherEngine ? 'Loading qtclient…' : 'Loading client from package…',
				30,
			);
			diag(`engine files ${jsName}/${wasmName}/qtloader`);
			const engineJs = await engineFile(jsName);
			const engineWasm = await engineFile(wasmName);
			const loaderBytes = await engineFile('qtloader.js');
			diag('engine bytes', {
				engine: launcherEngine ? 'launcher' : 'tibia',
				js: engineJs.byteLength,
				wasm: engineWasm.byteLength,
				loader: loaderBytes.byteLength,
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
			// Same-origin Blob so pthread Workers can load the engine script.
			// The glue runs as built (no patching).
			diag('engine script', {
				tipEngineJs,
				engineDir,
				jsBytes: engineJs.byteLength,
				wasmBytes: engineWasm.byteLength,
			});
			const engineScript = await loadScriptFromBytes(engineJs, scriptAttr);
			diag(`${jsName} script loaded`);
			callbacks.onStatus?.(
				launcherEngine ? 'Starting qtclient…' : 'Starting client…',
				55,
			);
			await loadScriptFromBytes(loaderBytes);
			diag('qtloader.js script loaded', {
				bytes: loaderBytes.byteLength,
			});
			callbacks.onStatus?.('Preparing session…', 70);
			diag('WebAssembly.compile start', {
				wasmBytes: engineWasm.byteLength,
			});
			const wasmModule = await WebAssembly.compile(engineWasm);
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
				mainScriptUrlOrBlob: `blob(${engineJs.byteLength})`,
				engineDir,
				tipEngineJs,
			});

			const prepareInstance = async (
				instance: TibiaModule,
				_config: unknown,
			): Promise<TibiaModule> => {
				callbacks.onStatus?.('Preparing…', 80);
				const skipLauncher = !launcherEngine && !!callbacks.skipLauncher;
				// The engine's own qtclient-fs Worker owns OPFS from main() on.
				closeOpfsWriter();
				// Assets are the launcher's job (CipSoft assets.json into the
				// package, like desktop); the game trusts its install.
				diag('tip ready → callMain', {
					home: CIP_HOME,
					program: thisProgram,
					skipLauncher,
				});
				callbacks.onStatus?.(
					launcherEngine ? 'Launching qtclient…' : 'Launching client…',
					95,
				);
				if (launcherEngine) callbacks.onLauncherReady?.();
				startHeapDiag(instance);
				// Capture abort / callMain rejection stacks for post-login OOB.
				try {
					const prevAbort = (instance as { onAbort?: (r: unknown) => void })
						.onAbort;
					(instance as { onAbort?: (r: unknown) => void }).onAbort = (
						reason,
					) => {
						reportBrowserCrash({
							name: 'WasmAbort',
							message:
								reason instanceof Error ? reason.message : String(reason),
							stack:
								reason instanceof Error
									? reason.stack
									: new Error(String(reason)).stack,
							stage: 'wasm.onAbort',
							revision: callbacks.revision,
							extra: { engine: wasmName, ...wasmHeapSnap() },
						});
						diagWarn('wasm onAbort', {
							reason: reason instanceof Error ? reason.message : String(reason),
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
								reportBrowserCrash({
									name: err instanceof Error ? err.name : 'Error',
									message: err instanceof Error ? err.message : String(err),
									stack: err instanceof Error ? err.stack : null,
									stage: 'callMain',
									revision: callbacks.revision,
									extra: { engine: wasmName, ...wasmHeapSnap() },
								});
								diagWarn('callMain throw', {
									name: err instanceof Error ? err.name : null,
									message: err instanceof Error ? err.message : String(err),
									stack:
										err instanceof Error ? err.stack?.slice(0, 3500) : null,
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
						engineDir && /\.js$/i.test(path) ? engineDir : callbacks.wasmBase;
					return wasmUrl(base, path, callbacks.engineStamp);
				},
				mainScriptUrlOrBlob,
				thisProgram,
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
			// Launcher only: the game signals via __qtclientGameUiReady right
			// before application.exec. Under JSPI, qtLoad resolves as soon as
			// entryFunction returns — far before the login mask paints.
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
