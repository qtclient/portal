export const OTC_SCRIPT_ATTR = 'data-otc-wasm';

/** Emscripten installs one-shot `let` bindings (e.g. EmscriptenEH); re-injecting otclient.js throws.
 *  Guards: script[data-otc-wasm] while loading/injected, __QTCLIENT_OTC_LOADED after parse, Module.calledRun. */
export function otcWasmAlreadyLoaded(): boolean {
	if (window.__QTCLIENT_OTC_LOADED) return true;
	if (document.querySelector(`script[${OTC_SCRIPT_ATTR}]`)) return true;
	return !!window.Module?.calledRun;
}

const AUTOSTART_KEY = 'qtcaac.otc.autostart';

/** Set by a remount reload: the reloaded /play launches without a second click. */
export function takeAutostartFlag(): boolean {
	try {
		const flagged = sessionStorage.getItem(AUTOSTART_KEY) === '1';
		sessionStorage.removeItem(AUTOSTART_KEY);
		return flagged;
	} catch {
		return false;
	}
}

const REMOUNT_COUNT_KEY = 'qtcaac.otc.remountCount';

export function reloadForOtcRemount(reason: string): { destroy: () => void } {
	console.warn(
		`[otclient] ${reason} — reloading (Emscripten cannot re-init in-page)`,
	);
	try {
		const count = Number(sessionStorage.getItem(REMOUNT_COUNT_KEY) || '0') || 0;
		if (count >= 2) {
			console.error(
				`[otclient] ${reason} — remount loop stopped after ${count} reloads`,
			);
			return { destroy() {} };
		}
		sessionStorage.setItem(REMOUNT_COUNT_KEY, String(count + 1));
		sessionStorage.setItem(AUTOSTART_KEY, '1');
	} catch {
		// Without storage the player clicks Play again.
	}
	// Defer so callers can finish mount/cleanup without racing navigation.
	queueMicrotask(() => location.reload());
	return { destroy() {} };
}

/** Clear remount-loop counter after a clean boot. */
export function clearOtcRemountCount(): void {
	try {
		sessionStorage.removeItem(REMOUNT_COUNT_KEY);
	} catch {
		/* ignore */
	}
}
