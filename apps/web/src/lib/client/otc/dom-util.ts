export const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

/** HUD displayDensity last applied by otcApplyUiScale (1 until the engine sets it). */
export const currentDensity = () => {
	const s = window.OTC_UI_SCALE;
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

type WasmExport =
	| '_otc_sync_shell_layout'
	| '_otc_request_shell_layout'
	| '_otc_signal_dom_input';

/** Calls a KEEPALIVE export; false if main has not run yet or the call threw. */
export function callModuleExport(name: WasmExport): boolean {
	const mod = window.Module;
	// Do not read Module.asm — newer Emscripten aborts on that getter (use wasmExports).
	// Stubs exist as soon as otclient.js parses; call only after main has run.
	if (!mod?.calledRun) return false;
	const fn = mod[name];
	if (typeof fn !== 'function') return false;
	try {
		fn();
		return true;
	} catch {
		return false;
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
