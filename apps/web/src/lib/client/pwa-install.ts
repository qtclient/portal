/**
 * Play-page PWA install helpers.
 * Dismiss / install preference lives on the shared `qtcaac.browser.v1` object
 * (same key otc-browser uses for hasPlayed).
 */

const STORAGE_KEY = 'qtcaac.browser.v1';

export type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type InstallMode = 'chromium' | 'ios' | 'manual';

type BrowserPrefs = {
	hasPlayed?: boolean;
	lastPlayedAt?: number;
	installDismissedAt?: number;
	[key: string]: unknown;
};

function readPrefs(): BrowserPrefs {
	try {
		return JSON.parse(
			localStorage.getItem(STORAGE_KEY) || '{}',
		) as BrowserPrefs;
	} catch {
		return {};
	}
}

function writePrefs(patch: Partial<BrowserPrefs>): void {
	try {
		const prev = readPrefs();
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, ...patch }));
	} catch {
		/* ignore quota / private mode */
	}
}

/** True when the page is already running as an installed app. */
export function isStandaloneDisplay(): boolean {
	try {
		if (window.matchMedia('(display-mode: standalone)').matches) return true;
		if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
		const nav = window.navigator as Navigator & { standalone?: boolean };
		if (nav.standalone === true) return true;
	} catch {
		/* ignore */
	}
	return false;
}

/** iOS Safari (incl. iPadOS desktop UA) — no beforeinstallprompt. */
export function isIosSafari(): boolean {
	try {
		const ua = navigator.userAgent || '';
		const iOS =
			/iphone|ipod|ipad/i.test(ua) ||
			(navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua));
		if (!iOS) return false;
		// Exclude Chrome/Firefox/Edge on iOS (they use WKWebView but not A2HS the same way).
		if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return false;
		return true;
	} catch {
		return false;
	}
}

export function isInstallDismissed(): boolean {
	return typeof readPrefs().installDismissedAt === 'number';
}

export function dismissInstallSuggestion(): void {
	writePrefs({ installDismissedAt: Date.now() });
}

export function clearInstallDismissed(): void {
	try {
		const prev = readPrefs();
		delete prev.installDismissedAt;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prev));
	} catch {
		/* ignore */
	}
}

export type PwaInstallController = {
	getDeferred: () => BeforeInstallPromptEvent | null;
	/** True when TopBar Install should be offered. */
	canOfferInstall: () => boolean;
	/** Auto-banner eligibility (respects dismiss). */
	shouldSuggest: () => boolean;
	/**
	 * Banner UI mode.
	 * @param ignoreDismissed — reopen from TopBar after dismiss.
	 */
	getMode: (opts?: { ignoreDismissed?: boolean }) => InstallMode | null;
	promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
	dismiss: () => void;
	destroy: () => void;
};

/**
 * Capture beforeinstallprompt early (must register before the browser fires it).
 * Call destroy() on page teardown.
 * @param onChange Invoked when install availability changes.
 */
export function createPwaInstallController(
	onChange?: () => void,
): PwaInstallController {
	let deferred: BeforeInstallPromptEvent | null = null;
	let installed = false;

	const notify = () => {
		try {
			onChange?.();
		} catch {
			/* ignore */
		}
	};

	const onBeforeInstall = (ev: Event) => {
		ev.preventDefault();
		deferred = ev as BeforeInstallPromptEvent;
		notify();
	};

	const onAppInstalled = () => {
		installed = true;
		deferred = null;
		clearInstallDismissed();
		notify();
	};

	window.addEventListener('beforeinstallprompt', onBeforeInstall);
	window.addEventListener('appinstalled', onAppInstalled);

	const blocked = () => installed || isStandaloneDisplay();

	return {
		getDeferred: () => deferred,
		canOfferInstall() {
			return !blocked();
		},
		shouldSuggest() {
			if (blocked() || isInstallDismissed()) return false;
			return true;
		},
		getMode(opts) {
			if (blocked()) return null;
			if (!opts?.ignoreDismissed && isInstallDismissed()) return null;
			if (deferred) return 'chromium';
			if (isIosSafari()) return 'ios';
			return 'manual';
		},
		async promptInstall() {
			if (!deferred) return 'unavailable';
			const promptEvent = deferred;
			deferred = null;
			try {
				await promptEvent.prompt();
				const choice = await promptEvent.userChoice;
				notify();
				return choice.outcome;
			} catch {
				notify();
				return 'unavailable';
			}
		},
		dismiss() {
			dismissInstallSuggestion();
			notify();
		},
		destroy() {
			window.removeEventListener('beforeinstallprompt', onBeforeInstall);
			window.removeEventListener('appinstalled', onAppInstalled);
		},
	};
}
