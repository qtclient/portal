/**
 * /play diagnostics for mobile Safari crash hunting.
 *
 * Safari often kills the tab ("A problem repeatedly occurred") without a JS
 * stack. Breadcrumbs are mirrored to sessionStorage so the next boot can dump
 * what happened just before the kill. Fetch failures also log the URL — Safari
 * hides it behind "You do not have permission to access the requested resource."
 */

const STORAGE_KEY = 'qtcaac.play.diag.v1';
const BOOT_ID_KEY = 'qtcaac.play.diag.boot';
const MAX_EVENTS = 120;
const FLUSH_MS = 250;

export type DiagEvent = {
	t: number;
	boot: string;
	msg: string;
	data?: Record<string, unknown>;
};

type DiagState = {
	bootId: string;
	startedAt: number;
	events: DiagEvent[];
	prevBootId: string | null;
	prevEvents: DiagEvent[];
};

let state: DiagState | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function now(): number {
	return typeof performance !== 'undefined' && performance.now
		? Math.round(performance.now())
		: Date.now();
}

function memorySnapshot(): Record<string, unknown> | undefined {
	try {
		const perf = performance as Performance & {
			memory?: {
				usedJSHeapSize?: number;
				totalJSHeapSize?: number;
				jsHeapSizeLimit?: number;
			};
		};
		const m = perf.memory;
		if (!m) return undefined;
		const mb = (n: number | undefined) =>
			typeof n === 'number' ? Math.round(n / (1024 * 1024)) : undefined;
		return {
			usedMb: mb(m.usedJSHeapSize),
			totalMb: mb(m.totalJSHeapSize),
			limitMb: mb(m.jsHeapSizeLimit),
		};
	} catch {
		return undefined;
	}
}

function deviceSnapshot(): Record<string, unknown> {
	const nav = navigator as Navigator & { deviceMemory?: number };
	return {
		ua: navigator.userAgent,
		lang: navigator.language,
		hw: navigator.hardwareConcurrency,
		deviceMemory: nav.deviceMemory,
		maxTouch: navigator.maxTouchPoints,
		screen: `${screen.width}x${screen.height}@${devicePixelRatio || 1}`,
		inner: `${window.innerWidth}x${window.innerHeight}`,
		online: navigator.onLine,
		coop: !!(globalThis as { crossOriginIsolated?: boolean })
			.crossOriginIsolated,
		sab: typeof SharedArrayBuffer !== 'undefined',
		mem: memorySnapshot(),
	};
}

function readStored(): { bootId?: string; events?: DiagEvent[] } {
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		return JSON.parse(raw) as { bootId?: string; events?: DiagEvent[] };
	} catch {
		return {};
	}
}

function scheduleFlush(): void {
	if (!state || flushTimer) return;
	flushTimer = setTimeout(() => {
		flushTimer = null;
		flushNow();
	}, FLUSH_MS);
}

function flushNow(): void {
	if (!state) return;
	try {
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				bootId: state.bootId,
				events: state.events.slice(-MAX_EVENTS),
			}),
		);
	} catch {
		/* private mode / quota */
	}
}

function shortUrl(url: string): string {
	try {
		const u = new URL(url, location.href);
		const path =
			u.pathname.length > 80 ? `…${u.pathname.slice(-72)}` : u.pathname;
		return `${u.origin}${path}${u.search ? '?…' : ''}`;
	} catch {
		return url.slice(0, 120);
	}
}

export type DiagOpts = {
	/** Write sessionStorage immediately — jetsam can kill before the 250ms flush. */
	flush?: boolean;
};

function pushEvent(
	msg: string,
	data: Record<string, unknown> | undefined,
	level: 'info' | 'warn',
	opts?: DiagOpts,
): void {
	if (!state) {
		if (level === 'warn') console.warn(`[play.diag] ${msg}`, data ?? '');
		return;
	}
	const mem = memorySnapshot();
	const event: DiagEvent = {
		t: now(),
		boot: state.bootId,
		msg: level === 'warn' ? `WARN ${msg}` : msg,
		data: mem || data ? { ...data, ...(mem ? { mem } : {}) } : undefined,
	};
	state.events.push(event);
	if (state.events.length > MAX_EVENTS) {
		state.events.splice(0, state.events.length - MAX_EVENTS);
	}
	if (level === 'warn') {
		console.warn(`[play.diag +${event.t}ms]`, event.msg, event.data ?? '');
	} else {
		const payload = event.data ? [event.msg, event.data] : [event.msg];
		console.info(`[play.diag +${event.t}ms]`, ...payload);
	}
	if (opts?.flush) {
		if (flushTimer) {
			clearTimeout(flushTimer);
			flushTimer = null;
		}
		flushNow();
	} else {
		scheduleFlush();
	}
}

/** Record a breadcrumb (console + sessionStorage). */
export function diag(
	msg: string,
	data?: Record<string, unknown>,
	opts?: DiagOpts,
): void {
	pushEvent(msg, data, 'info', opts);
}

export function diagWarn(
	msg: string,
	data?: Record<string, unknown>,
	opts?: DiagOpts,
): void {
	pushEvent(msg, data, 'warn', opts);
}

/** Critical stage — always flush so Safari kill keeps this line. */
export function diagFlush(msg: string, data?: Record<string, unknown>): void {
	pushEvent(msg, data, 'info', { flush: true });
}

function dumpPreviousSession(): void {
	if (!state?.prevEvents.length) return;
	console.group(
		`[play.diag] previous boot ${state.prevBootId ?? '?'} (${state.prevEvents.length} events) — check last lines before Safari kill`,
	);
	for (const e of state.prevEvents.slice(-40)) {
		if (e.data) console.info(`  +${e.t}ms ${e.msg}`, e.data);
		else console.info(`  +${e.t}ms ${e.msg}`);
	}
	console.groupEnd();
}

function patchFetch(): void {
	const orig = window.fetch.bind(window);
	window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
		const url =
			typeof input === 'string'
				? input
				: input instanceof URL
					? input.href
					: input.url;
		const method = (
			init?.method || (input instanceof Request ? input.method : 'GET')
		).toUpperCase();
		const t0 = now();
		try {
			const res = await orig(input, init);
			const ms = now() - t0;
			if (!res.ok) {
				diagWarn(`fetch ${res.status}`, {
					method,
					url: shortUrl(url),
					ms,
					type: res.type,
				});
			} else if (ms >= 1500 || /\/(packs|content)\//.test(url)) {
				diag(`fetch ok`, {
					method,
					url: shortUrl(url),
					ms,
					status: res.status,
					bytes: res.headers.get('content-length'),
				});
			}
			return res;
		} catch (err) {
			diagWarn(`fetch threw`, {
				method,
				url: shortUrl(url),
				ms: now() - t0,
				err: err instanceof Error ? err.message : String(err),
			});
			throw err;
		}
	};
}

function watchResources(): void {
	const onError = (event: Event) => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const tag = target.tagName.toLowerCase();
		if (tag !== 'img' && tag !== 'script' && tag !== 'link' && tag !== 'source')
			return;
		const src =
			(target as HTMLImageElement).currentSrc ||
			(target as HTMLImageElement).src ||
			(target as HTMLLinkElement).href ||
			target.getAttribute('src') ||
			target.getAttribute('href') ||
			'';
		diagWarn(`resource error <${tag}>`, { url: shortUrl(src) });
	};
	window.addEventListener('error', onError, true);

	window.addEventListener('unhandledrejection', (event) => {
		const reason: unknown = event.reason;
		const err =
			reason instanceof Error
				? reason.message
				: typeof reason === 'string'
					? reason
					: String(reason);
		const stack =
			reason instanceof Error && reason.stack
				? reason.stack.slice(0, 1500)
				: undefined;
		diagWarn('unhandledrejection', { err, stack });
		try {
			sessionStorage.setItem(
				'qtcaac.last.reject',
				JSON.stringify({ err, stack, t: now() }),
			);
		} catch {
			/* ignore */
		}
	});

	window.addEventListener('error', (event) => {
		if (event.message)
			diagWarn('window.onerror', {
				msg: event.message,
				file: event.filename,
				line: event.lineno,
				stack:
					event.error instanceof Error
						? event.error.stack?.slice(0, 1500)
						: undefined,
			});
	});

	document.addEventListener('visibilitychange', () => {
		diag(`visibility ${document.visibilityState}`);
	});
	window.addEventListener('pagehide', (event) => {
		diag(`pagehide`, { persisted: event.persisted });
		try {
			const tip = (
				globalThis as unknown as {
					qtclientFs?: { shutdown?: () => void };
				}
			).qtclientFs;
			tip?.shutdown?.();
		} catch {
			/* ignore */
		}
		flushNow();
	});
	window.addEventListener('freeze', () => {
		diag('freeze');
		flushNow();
	});

	const po = new PerformanceObserver((list) => {
		for (const entry of list.getEntries()) {
			const r = entry as PerformanceResourceTiming;
			// COEP/CORP blocks often land as transferSize 0 + duration 0.
			if (r.transferSize === 0 && r.decodedBodySize === 0 && r.duration === 0) {
				diagWarn('resource blocked/empty', {
					url: shortUrl(r.name),
					initiator: r.initiatorType,
				});
			}
		}
	});
	po.observe({ type: 'resource', buffered: true });
}

/**
 * Install once per /play document. Dumps the previous boot's breadcrumbs first
 * (those are the ones that matter after a Safari kill/reload).
 */
export function installPlayDiag(): () => void {
	if (installed) return () => undefined;
	installed = true;

	const prev = readStored();
	let bootId = '1';
	try {
		const n = Number(sessionStorage.getItem(BOOT_ID_KEY) || '0') || 0;
		bootId = String(n + 1);
		sessionStorage.setItem(BOOT_ID_KEY, bootId);
	} catch {
		bootId = String(Date.now());
	}

	state = {
		bootId,
		startedAt: Date.now(),
		events: [],
		prevBootId: prev.bootId ?? null,
		prevEvents: Array.isArray(prev.events) ? prev.events : [],
	};

	dumpPreviousSession();
	diag('boot', { ...deviceSnapshot(), href: location.href });
	patchFetch();
	watchResources();

	(window as Window & { __qtclientDiag?: unknown }).__qtclientDiag = {
		dump: () => {
			dumpPreviousSession();
			console.group(`[play.diag] current boot ${state?.bootId}`);
			for (const e of state?.events ?? []) {
				if (e.data) console.info(`  +${e.t}ms ${e.msg}`, e.data);
				else console.info(`  +${e.t}ms ${e.msg}`);
			}
			console.groupEnd();
			return state?.events ?? [];
		},
		mark: diag,
		flush: flushNow,
	};

	return () => {
		flushNow();
	};
}
