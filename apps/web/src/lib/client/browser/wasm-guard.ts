export const QTCLIENT_SCRIPT_ATTR = 'data-qtclient-wasm';

/** Emscripten installs one-shot `let` bindings; re-injecting tibia.js throws.
 *  Guards: script[data-qtclient-wasm] while loading, __QTCLIENT_WASM_LOADED after parse, Module.calledRun. */
export function qtclientWasmAlreadyLoaded(): boolean {
	if (window.__QTCLIENT_WASM_LOADED) return true;
	if (document.querySelector(`script[${QTCLIENT_SCRIPT_ATTR}]`)) return true;
	return !!window.Module?.calledRun;
}

const AUTOSTART_KEY = 'qtcaac.play.autostart';

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

const REMOUNT_COUNT_KEY = 'qtcaac.play.remountCount';

export function reloadForWasmRemount(reason: string): { destroy: () => void } {
	console.warn(
		`[qtclient] ${reason} — reloading (Emscripten cannot re-init in-page)`,
	);
	try {
		const count = Number(sessionStorage.getItem(REMOUNT_COUNT_KEY) || '0') || 0;
		if (count >= 2) {
			console.error(
				`[qtclient] ${reason} — remount loop stopped after ${count} reloads`,
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
export function clearWasmRemountCount(): void {
	try {
		sessionStorage.removeItem(REMOUNT_COUNT_KEY);
	} catch {
		/* ignore */
	}
}
