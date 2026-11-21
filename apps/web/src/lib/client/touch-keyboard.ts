/**
 * /play on touch devices: let a late Qt still open the on-screen keyboard.
 *
 * iOS Safari only raises the keyboard for a focus() made while the tap is
 * being dispatched. Qt wasm handles a tap from its event queue whenever the
 * instance was suspended (JSPI) or busy, which on a phone can be more than a
 * second later: Qt then focuses its hidden IME input outside the gesture and
 * Safari flashes the input accessory bar but shows no keyboard.
 *
 * So, during the tap itself, focus the window's IME input with
 * `inputmode="none"`: that starts Safari's input session without a keyboard.
 * When Qt later wants text input it sets `inputMode` and calls focus() on the
 * same element, and Safari only has to swap the keyboard of a session the
 * user started, which it allows outside the gesture. Qt's own code path for
 * the first text focus calls focus() on the window's focus helper just
 * before the IME input; while a primed session is waiting for Qt, that call
 * is held back so it does not end the session. A tap Qt does not turn into
 * text input hands focus back to the helper once the wait is over.
 */

/** How long a primed input waits for Qt's late handling of the tap. */
const QT_LATE_MS = 4000;

type QtWindowParts = { input: HTMLInputElement; helper: HTMLElement };

function qtWindowParts(event: Event): QtWindowParts | null {
	for (const node of event.composedPath()) {
		if (!(node instanceof HTMLElement) || !node.classList.contains('qt-window'))
			continue;
		const input = node.querySelector<HTMLInputElement>(
			':scope > .qt-window-input-element',
		);
		const helper = node.querySelector<HTMLElement>(
			':scope > .qt-window-focus-helper',
		);
		return input && helper ? { input, helper } : null;
	}
	return null;
}

function deepActiveElement(): Element | null {
	let active = document.activeElement;
	while (active?.shadowRoot?.activeElement)
		active = active.shadowRoot.activeElement;
	return active;
}

/** The on-screen keyboard is up: the visual viewport lost the keyboard's height. */
function keyboardShown(): boolean {
	const vv = window.visualViewport;
	return !!vv && window.innerHeight - vv.height * vv.scale > 120;
}

export function installTouchKeyboardPriming(screen: HTMLElement): () => void {
	const helperFocus = new WeakMap<HTMLElement, () => void>();
	let primed: (QtWindowParts & { until: number; timer: number }) | null = null;

	const settle = () => {
		if (!primed) return;
		const { input, helper } = primed;
		primed = null;
		// Qt never asked for text input: give focus back to Qt's helper, as Qt
		// would have, so the idle IME input does not keep the session.
		if (deepActiveElement() === input && input.inputMode === 'none')
			helperFocus.get(helper)?.();
	};

	const holdHelperFocus = (helper: HTMLElement) => {
		if (helperFocus.has(helper)) return;
		// eslint-disable-next-line @typescript-eslint/unbound-method -- intentional extract + .call(this)
		const original = HTMLElement.prototype.focus;
		helperFocus.set(helper, () =>
			original.call(helper, { preventScroll: true }),
		);
		helper.focus = function (this: HTMLElement, options?: FocusOptions) {
			if (primed && primed.helper === this && performance.now() < primed.until)
				return;
			original.call(this, options);
		};
	};

	const onPointerDown = (event: PointerEvent) => {
		if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
		// Keyboard already up (typing in chat, moving the caret): leave it to Qt.
		if (keyboardShown()) return;
		const parts = qtWindowParts(event);
		if (!parts) return;
		holdHelperFocus(parts.helper);
		if (primed) window.clearTimeout(primed.timer);
		// Already focused but with no keyboard up means Qt focused it outside a
		// gesture (no input session): refocus so this tap starts one.
		if (deepActiveElement() === parts.input) parts.input.blur();
		parts.input.inputMode = 'none';
		parts.input.focus({ preventScroll: true });
		primed = {
			...parts,
			until: performance.now() + QT_LATE_MS,
			timer: window.setTimeout(settle, QT_LATE_MS),
		};
	};

	// Capture: runs during dispatch, before Qt's own handler on its window.
	screen.addEventListener('pointerdown', onPointerDown, true);
	return () => {
		screen.removeEventListener('pointerdown', onPointerDown, true);
		if (primed) window.clearTimeout(primed.timer);
		primed = null;
	};
}
