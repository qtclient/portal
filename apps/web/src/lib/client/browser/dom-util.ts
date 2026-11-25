export const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

/** HUD displayDensity (1 until the engine sets QTCLIENT_UI_SCALE). */
export const currentDensity = () => {
	const s = window.QTCLIENT_UI_SCALE;
	return s && s > 0 ? s : 1;
};

export function focusNoScroll(el: HTMLElement | null) {
	if (!el) return;
	try {
		el.focus({ preventScroll: true });
	} catch {
		try {
			el.focus();
		} catch {
			/* ignore */
		}
	}
}

/** True (and stamps now) unless `key` was stamped within the last `ms` this session. */
export function sessionCooldown(key: string, ms: number): boolean {
	try {
		const last = Number(sessionStorage.getItem(key) || 0);
		if (last && Date.now() - last < ms) return false;
		sessionStorage.setItem(key, String(Date.now()));
		return true;
	} catch {
		return true;
	}
}

export function clearSessionCooldown(key: string) {
	try {
		sessionStorage.removeItem(key);
	} catch {
		/* ignore */
	}
}

type Opts = AddEventListenerOptions | boolean;

/** Tracks listeners, timers and teardown callbacks; dispose() undoes them all. */
export function createListenerBag() {
	const disposers: Array<() => void> = [];

	function listen<K extends keyof WindowEventMap>(
		target: Window,
		type: K,
		fn: (ev: WindowEventMap[K]) => void,
		opts?: Opts,
	): void;
	function listen<K extends keyof DocumentEventMap>(
		target: Document,
		type: K,
		fn: (ev: DocumentEventMap[K]) => void,
		opts?: Opts,
	): void;
	function listen<K extends keyof HTMLElementEventMap>(
		target: HTMLElement,
		type: K,
		fn: (ev: HTMLElementEventMap[K]) => void,
		opts?: Opts,
	): void;
	function listen<K extends keyof VisualViewportEventMap>(
		target: VisualViewport,
		type: K,
		fn: (ev: VisualViewportEventMap[K]) => void,
		opts?: Opts,
	): void;
	function listen(
		target: EventTarget,
		type: string,
		fn: (ev: Event) => void,
		opts?: Opts,
	): void;
	function listen(
		target: EventTarget,
		type: string,
		fn: (ev: never) => void,
		opts?: Opts,
	) {
		const handler = fn as unknown as EventListener;
		target.addEventListener(type, handler, opts);
		disposers.push(() => target.removeEventListener(type, handler, opts));
	}

	return {
		listen,
		defer(fn: () => void) {
			disposers.push(fn);
		},
		timeout(fn: () => void, ms: number) {
			const id = setTimeout(fn, ms);
			disposers.push(() => clearTimeout(id));
		},
		dispose() {
			for (const fn of disposers.splice(0)) {
				try {
					fn();
				} catch {
					/* ignore */
				}
			}
		},
	};
}

export type ListenerBag = ReturnType<typeof createListenerBag>;
