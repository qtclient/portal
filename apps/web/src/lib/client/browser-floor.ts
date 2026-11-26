/**
 * Browser floor for the /play WASM engines.
 *
 * tibia.wasm and launcher.wasm are built with `-sJSPI`: Emscripten wraps the
 * engine's async imports in `WebAssembly.Suspending` while instantiating, so a
 * browser without JSPI cannot start them at all. JSPI shipped in Chrome/Edge
 * 137, Firefox 153 and Safari 27 (iOS/iPadOS 27 — every iOS browser runs
 * Safari's engine). This file is the only place that floor is written down:
 * the unsupported-browser message and telemetry ingest follow it.
 *
 * The /play gate itself feature-detects (`wasmJspiSupported`); the versions
 * here only pick the advice shown to the player and label gate telemetry.
 */
export const JSPI_FLOOR = {
	chrome: 137,
	edge: 137,
	firefox: 153,
	safari: 27,
	/** iOS / iPadOS major (Safari's version follows it). */
	ios: 27,
} as const;

export type BrowserFamily = 'chrome' | 'edge' | 'firefox' | 'safari' | 'other';
export type BrowserOs =
	| 'ios'
	| 'ipados'
	| 'macos'
	| 'android'
	| 'windows'
	| 'linux'
	| 'other';

export type BrowserInfo = {
	family: BrowserFamily;
	/** Major version of the browser, when the user agent states it. */
	version: number | null;
	os: BrowserOs;
};

function major(ua: string, re: RegExp): number | null {
	const m = re.exec(ua);
	if (!m) return null;
	const n = Number(m[1]);
	return Number.isFinite(n) ? n : null;
}

/**
 * Coarse browser + OS from the user agent. iPadOS Safari reports a Macintosh
 * user agent; a touch screen (`navigator.maxTouchPoints > 1`) tells them apart.
 */
export function detectBrowser(ua: string, maxTouchPoints = 0): BrowserInfo {
	let os: BrowserOs = 'other';
	if (/iPhone|iPod/.test(ua)) os = 'ios';
	else if (/iPad/.test(ua)) os = 'ipados';
	else if (/Macintosh/.test(ua)) os = maxTouchPoints > 1 ? 'ipados' : 'macos';
	else if (/Android/.test(ua)) os = 'android';
	else if (/Windows/.test(ua)) os = 'windows';
	else if (/Linux|CrOS|X11/.test(ua)) os = 'linux';

	if (os === 'ios' || os === 'ipados') {
		// Third-party iOS browsers are WebKit shells; their own version numbers
		// say nothing about JSPI, so only Safari's version is kept.
		if (/EdgiOS\//.test(ua)) return { family: 'edge', version: null, os };
		if (/CriOS\//.test(ua)) return { family: 'chrome', version: null, os };
		if (/FxiOS\//.test(ua)) return { family: 'firefox', version: null, os };
		return { family: 'safari', version: major(ua, /Version\/(\d+)/), os };
	}
	if (/Edg(?:e|A)?\//.test(ua))
		return { family: 'edge', version: major(ua, /Edg(?:e|A)?\/(\d+)/), os };
	if (/Firefox\//.test(ua))
		return { family: 'firefox', version: major(ua, /Firefox\/(\d+)/), os };
	if (/Chrome\/|Chromium\//.test(ua))
		return { family: 'chrome', version: major(ua, /(?:Chrome|Chromium)\/(\d+)/), os };
	if (/Safari\//.test(ua) && /Version\//.test(ua))
		return { family: 'safari', version: major(ua, /Version\/(\d+)/), os };
	return { family: 'other', version: null, os };
}

const DESKTOP = 'or install the desktop client from the Download page (/download).';

/** What the player should do when /play's JSPI gate fails. */
export function unsupportedBrowserMessage(info: BrowserInfo): string {
	const f = JSPI_FLOOR;
	if (info.os === 'ios' || info.os === 'ipados') {
		const device = info.os === 'ios' ? 'iPhone' : 'iPad';
		const system = info.os === 'ios' ? 'iOS' : 'iPadOS';
		return (
			`The web client needs ${system} ${f.ios} or later on this ${device}. ` +
			'Every browser on it uses Safari’s engine, so switching browsers won’t help. ' +
			'Update in Settings → General → Software Update, then reload this page.'
		);
	}
	const yours = info.version != null ? ` (this one is ${info.version})` : '';
	switch (info.family) {
		case 'safari':
			return (
				`The web client needs Safari ${f.safari} or later${yours}. ` +
				'Update macOS in System Settings → General → Software Update, ' +
				`use Chrome ${f.chrome}+ or Firefox ${f.firefox}+, ${DESKTOP}`
			);
		case 'firefox':
			return (
				`The web client needs Firefox ${f.firefox} or later${yours}. ` +
				`Update Firefox and reload this page, ${DESKTOP}`
			);
		case 'edge':
			return (
				`The web client needs Microsoft Edge ${f.edge} or later${yours}. ` +
				`Update Edge and reload this page, ${DESKTOP}`
			);
		case 'chrome':
			return (
				`The web client needs Chrome ${f.chrome} or later${yours}. ` +
				`Update your browser and reload this page, ${DESKTOP}`
			);
		default:
			return (
				'This browser can’t run the web client. Use Chrome or Edge ' +
				`${f.chrome}+, Firefox ${f.firefox}+ or Safari ${f.safari}+, ${DESKTOP}`
			);
	}
}

/**
 * One gate record for /admin/telemetry, posted to the hardware receiver as a
 * system survey (`dataType: "BrowserGate"`). Carries no client id or account
 * data; the server adds platform/revision like any survey.
 */
export function reportBrowserGate(opts: {
	info: BrowserInfo;
	engine: 'launcher' | 'tibia';
	reason: string;
	revision: string;
}): void {
	try {
		const { info } = opts;
		const body = JSON.stringify({
			dataType: 'BrowserGate',
			platform: 'wasm',
			revision: opts.revision || undefined,
			reason: opts.reason,
			engine: opts.engine,
			browser: info.family,
			browserVersion: info.version,
			os: info.os,
		});
		void fetch(`${location.origin}/clientservices/hardwarereceiver.php`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body,
			keepalive: true,
			credentials: 'omit',
		}).catch(() => {
			/* best effort */
		});
	} catch {
		/* never let reporting break the page */
	}
}
