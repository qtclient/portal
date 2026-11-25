/**
 * iOS Safari only raises the keyboard for focus() made on the user-gesture
 * call stack. Qt wasm + JSPI queues pointerdown and runs C++ (including
 * QWasmInputContext::updateInputElement → input.focus()) after dispatch —
 * too late: Safari flashes the accessory/URL chrome and shows no keyboard.
 *
 * Root cause fix: during the tap itself, re-focus the window's IME input when
 * Qt already configured it for text (inputMode !== "none"). Login fields get
 * activeFocus on show, so the element already has a real inputMode/type; we
 * only need the focus() call to happen in-gesture.
 *
 * Do NOT prime with inputmode="none": that replaces Qt's real mode, Safari
 * never opens a keyboard for "none", and a later inputMode change outside the
 * gesture does not upgrade the session (URL bar bounce, no keys).
 *
 * Changing input.type while focused also dismisses the iOS keyboard; defer
 * type writes on the IME element until it blurs.
 *
 * Separately: Qt's wasm platform calls releasePointerCapture on pointerup
 * without checking hasPointerCapture. Safari often releases capture itself
 * when the keyboard opens / the touch ends, so the call throws NotFoundError,
 * the exception escapes Qt's event handler, and the WASM instance dies.
 * installSafePointerCapture mirrors the stock Qt hasPointerCapture guard
 * until the next qtclient/Qt5 kit pin.
 */

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

const guardedInputs = new WeakSet<HTMLInputElement>();

/**
 * iOS drops the keyboard when a focused <input>'s type changes (e.g. Qt
 * flipping text ↔ password for echoMode). Queue the write until blur.
 */
function guardInputTypeWhileFocused(input: HTMLInputElement): void {
	if (guardedInputs.has(input)) return;
	guardedInputs.add(input);

	const desc =
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type') ??
		Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'type');
	if (!desc?.get || !desc?.set) return;

	let pending: string | null = null;
	Object.defineProperty(input, 'type', {
		configurable: true,
		enumerable: desc.enumerable ?? true,
		get() {
			return pending ?? desc.get!.call(this);
		},
		set(value: string) {
			const next = String(value);
			if (deepActiveElement() === this && desc.get!.call(this) !== next) {
				pending = next;
				return;
			}
			pending = null;
			desc.set!.call(this, next);
		},
	});
	input.addEventListener('blur', () => {
		if (pending === null) return;
		const next = pending;
		pending = null;
		desc.set!.call(input, next);
	});
}

/**
 * Swallow NotFoundError from Element.releasePointerCapture when the browser
 * already released capture (iOS Safari + Qt wasm pointerup). Idempotent.
 */
export function installSafePointerCapture(): () => void {
	const proto = Element.prototype;
	const original = proto.releasePointerCapture;
	const marker = '__qtSafeReleasePointerCapture' as const;
	if ((proto as ElementPrototypeWithMarker)[marker]) return () => {};

	proto.releasePointerCapture = function (
		this: Element,
		pointerId: number,
	): void {
		try {
			if (
				typeof this.hasPointerCapture === 'function' &&
				!this.hasPointerCapture(pointerId)
			) {
				return;
			}
			original.call(this, pointerId);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'NotFoundError')
				return;
			throw error;
		}
	};
	(proto as ElementPrototypeWithMarker)[marker] = true;

	return () => {
		proto.releasePointerCapture = original;
		delete (proto as ElementPrototypeWithMarker)[marker];
	};
}

type ElementPrototypeWithMarker = typeof Element.prototype & {
	__qtSafeReleasePointerCapture?: boolean;
};

export function installTouchKeyboardPriming(screen: HTMLElement): () => void {
	const onPointerDown = (event: PointerEvent) => {
		if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
		if (keyboardShown()) return;
		const parts = qtWindowParts(event);
		if (!parts) return;

		guardInputTypeWhileFocused(parts.input);

		const mode = parts.input.inputMode || 'text';
		// Qt has not asked for text input yet (focus helper owns the window).
		// Do not invent a session — a blind focus() opens the keyboard on every
		// map tap. Login forceActiveFocus configures inputMode before the tap.
		if (mode === 'none') return;

		// Already focused from Qt's late focus() (no keyboard): blur+focus inside
		// the gesture starts a real Safari input session.
		if (deepActiveElement() === parts.input) parts.input.blur();
		parts.input.focus({ preventScroll: true });
	};

	// Capture: still on the user-gesture stack, before Qt's queued handler.
	screen.addEventListener('pointerdown', onPointerDown, true);
	return () => {
		screen.removeEventListener('pointerdown', onPointerDown, true);
	};
}
