/**
 * Reliable iOS Safari keyboard for Qt wasm text fields.
 *
 * Qt wasm + JSPI focuses the 1px `.qt-window-input-element` after pointer
 * dispatch — too late for Safari. Canvas pointer defaults also move DOM focus
 * to <body>, so the keyboard flashes and keystrokes never land.
 *
 * Logs (v1.0.228) showed every tap as:
 *   focus → prime → blur(body) → focus → kb up → blur(body) ~700ms → kb down
 * and `input.type` text↔password (email echoMode / password field) applied on
 * blur while the keyboard was still up, which dismisses the session.
 *
 * Hold a session: preventDefault on the priming pointerdown (stop body steal,
 * still let Qt see the event), focus without blur-first, re-focus on blur while
 * Qt still wants text (inputMode !== "none"), and defer type writes until the
 * keyboard is gone.
 *
 * Next/Go: one shared HTML input serves every QML field. enterkeyhint starts
 * as "next"; Enter synthesizes Tab into the qt-window (KeyNavigation), then
 * flips the hint to "go". A later Enter is a real Enter (login submit).
 *
 * Also: Qt releasePointerCapture NotFoundError → WASM abort; guard it.
 */

import { diag, diagFlush, diagWarn } from './play-diag';

type QtWindowParts = { input: HTMLInputElement; helper: HTMLElement; window: HTMLElement };

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
		return input && helper ? { input, helper, window: node } : null;
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

function imeSnapshot(input?: HTMLInputElement | null): Record<string, unknown> {
	const active = deepActiveElement();
	const vv = window.visualViewport;
	const el =
		input ??
		(active instanceof HTMLInputElement &&
		active.classList.contains('qt-window-input-element')
			? active
			: document.querySelector<HTMLInputElement>('.qt-window-input-element'));
	return {
		kb: keyboardShown(),
		inner: `${window.innerWidth}x${window.innerHeight}`,
		vv: vv
			? `${Math.round(vv.width)}x${Math.round(vv.height)}@${vv.scale.toFixed(2)}+${Math.round(vv.offsetTop)}`
			: null,
		active:
			active instanceof HTMLElement
				? `${active.tagName.toLowerCase()}.${[...active.classList].slice(0, 3).join('.')}`
				: active?.nodeName ?? null,
		inputMode: el?.inputMode ?? null,
		type: el?.type ?? null,
		enterKeyHint: el?.enterKeyHint || null,
		focused: !!(el && deepActiveElement() === el),
	};
}

const guardedInputs = new WeakSet<HTMLInputElement>();
const observedInputs = new WeakSet<HTMLInputElement>();

/** Active IME hold: re-focus on blur until Qt sets inputMode=none. */
let holdInput: HTMLInputElement | null = null;
let holdWindow: HTMLElement | null = null;
/** "next" → Tab into the next QML field; "go" → real Enter (submit). */
let enterStep: 'next' | 'go' = 'next';
let reentering = false;
let pendingType: string | null = null;
let typeDesc: PropertyDescriptor | null = null;

function rateLimited(key: string, minMs: number, fn: () => void): void {
	const g = globalThis as unknown as { __qtImeDiagAt?: Record<string, number> };
	const stamp = (g.__qtImeDiagAt ??= {});
	const now = performance.now();
	if ((stamp[key] ?? 0) + minMs > now) return;
	stamp[key] = now;
	fn();
}

function applyPendingType(input: HTMLInputElement | null, reason: string): void {
	if (pendingType === null || !typeDesc?.set || !input) return;
	if (keyboardShown() && deepActiveElement() === input) return;
	const next = pendingType;
	pendingType = null;
	diag('ime.type apply', { to: next, reason, ...imeSnapshot(input) });
	typeDesc.set.call(input, next);
}

function endHold(reason: string): void {
	if (!holdInput && !holdWindow) return;
	const input = holdInput;
	diag('ime.hold end', { reason, ...imeSnapshot(input) });
	holdInput = null;
	holdWindow = null;
	enterStep = 'next';
	// Keyboard must be down before type flips; viewport handler will retry if not.
	if (!keyboardShown()) applyPendingType(input, 'hold-end');
}

function beginHold(parts: QtWindowParts): void {
	holdInput = parts.input;
	holdWindow = parts.window;
	syncEnterKeyHint(parts.input);
	diagFlush('ime.hold begin', {
		enterStep,
		...imeSnapshot(parts.input),
	});
}

function syncEnterKeyHint(input: HTMLInputElement): void {
	const hint = enterStep === 'go' ? 'go' : 'next';
	const autocomplete = enterStep === 'go' ? 'current-password' : 'username';
	let changed = false;
	if (input.enterKeyHint !== hint) {
		input.enterKeyHint = hint;
		changed = true;
	}
	if (input.autocomplete !== autocomplete) {
		input.autocomplete = autocomplete;
		changed = true;
	}
	if (changed) diag('ime.enterKeyHint', { hint, autocomplete, ...imeSnapshot(input) });
}

/**
 * iOS drops the keyboard when a focused <input>'s type changes. Keep the
 * write queued until the hold ends and the keyboard is down.
 */
function guardInputTypeWhileFocused(input: HTMLInputElement): void {
	if (guardedInputs.has(input)) return;
	guardedInputs.add(input);

	const desc =
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'type') ??
		Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'type');
	if (!desc?.get || !desc?.set) return;
	typeDesc = desc;

	Object.defineProperty(input, 'type', {
		configurable: true,
		enumerable: desc.enumerable ?? true,
		get() {
			return pendingType ?? desc.get!.call(this);
		},
		set(value: string) {
			const next = String(value);
			const current = pendingType ?? String(desc.get!.call(this));
			if (current === next) return;
			const holding =
				holdInput === this &&
				(deepActiveElement() === this || keyboardShown());
			if (holding) {
				pendingType = next;
				diag('ime.type deferred', {
					from: String(desc.get!.call(this)),
					to: next,
					...imeSnapshot(input),
				});
				return;
			}
			pendingType = null;
			diag('ime.type set', {
				from: String(desc.get!.call(this)),
				to: next,
				...imeSnapshot(input),
			});
			desc.set!.call(this, next);
		},
	});
}

function dispatchQtKey(
	qtWindow: HTMLElement,
	key: string,
	code: string,
	keyCode: number,
): void {
	const init: KeyboardEventInit = {
		key,
		code,
		keyCode,
		which: keyCode,
		bubbles: true,
		cancelable: true,
	};
	qtWindow.dispatchEvent(new KeyboardEvent('keydown', init));
	qtWindow.dispatchEvent(new KeyboardEvent('keyup', init));
}

function observeImeInput(input: HTMLInputElement): void {
	if (observedInputs.has(input)) return;
	observedInputs.add(input);
	guardInputTypeWhileFocused(input);

	input.addEventListener('focus', () => {
		diag('ime.focus', imeSnapshot(input), { flush: true });
		if (holdInput === input) syncEnterKeyHint(input);
	});

	input.addEventListener('blur', () => {
		diag('ime.blur', imeSnapshot(input), { flush: true });
		if (reentering) return;
		// Qt released the field — allow the blur.
		if ((input.inputMode || 'text') === 'none') {
			endHold('inputMode-none');
			return;
		}
		// Still an IME field: Safari/canvas stole focus. Take it back.
		if (holdInput === input) {
			reentering = true;
			try {
				input.focus({ preventScroll: true });
				diag('ime.hold refocus', imeSnapshot(input), { flush: true });
			} finally {
				reentering = false;
			}
			return;
		}
		applyPendingType(input, 'blur');
	});

	input.addEventListener('keydown', (event) => {
		if (event.key !== 'Enter' && event.key !== 'Go') return;
		const qtWindow =
			holdWindow ??
			input.closest<HTMLElement>('.qt-window') ??
			document.querySelector<HTMLElement>('.qt-window');
		if (!qtWindow) return;

		event.preventDefault();
		event.stopPropagation();

		if (enterStep === 'next') {
			enterStep = 'go';
			syncEnterKeyHint(input);
			diagFlush('ime.next → Tab', imeSnapshot(input));
			dispatchQtKey(qtWindow, 'Tab', 'Tab', 9);
			// Keep the HTML focus; Qt will retarget the IME to the next field.
			queueMicrotask(() => {
				if (holdInput === input && (input.inputMode || 'text') !== 'none')
					input.focus({ preventScroll: true });
			});
			return;
		}

		diagFlush('ime.go → Enter', imeSnapshot(input));
		dispatchQtKey(qtWindow, 'Enter', 'Enter', 13);
	});

	const mo = new MutationObserver((records) => {
		for (const r of records) {
			if (r.type !== 'attributes' || r.attributeName !== 'inputmode') continue;
			const mode = input.inputMode || 'text';
			diag('ime.inputMode', { value: mode, ...imeSnapshot(input) });
			if (mode === 'none') endHold('inputMode-attr-none');
			else if (holdInput === input) syncEnterKeyHint(input);
		}
	});
	mo.observe(input, { attributes: true, attributeFilter: ['inputmode'] });
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

	let swallows = 0;
	proto.releasePointerCapture = function (
		this: Element,
		pointerId: number,
	): void {
		try {
			if (
				typeof this.hasPointerCapture === 'function' &&
				!this.hasPointerCapture(pointerId)
			) {
				swallows += 1;
				if (swallows <= 8 || swallows % 25 === 0) {
					diag('pointerCapture.skip-unowned', {
						pointerId,
						swallows,
						tag:
							this instanceof HTMLElement
								? `${this.tagName.toLowerCase()}.${[...this.classList].slice(0, 2).join('.')}`
								: this.nodeName,
						...imeSnapshot(),
					});
				}
				return;
			}
			original.call(this, pointerId);
		} catch (error) {
			if (error instanceof DOMException && error.name === 'NotFoundError') {
				swallows += 1;
				diagWarn('pointerCapture.NotFoundError swallowed', {
					pointerId,
					swallows,
					...imeSnapshot(),
				});
				return;
			}
			diagWarn('pointerCapture.release threw', {
				pointerId,
				err:
					error instanceof Error
						? `${error.name}: ${error.message}`
						: String(error),
				...imeSnapshot(),
			});
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
		const parts = qtWindowParts(event);
		if (!parts) {
			if (holdInput) endHold('pointer-outside-qt');
			rateLimited('prime-no-qt', 5_000, () =>
				diag('ime.prime skip', {
					reason: 'no-qt-window',
					pointerType: event.pointerType,
				}),
			);
			return;
		}

		observeImeInput(parts.input);

		const mode = parts.input.inputMode || 'text';
		if (mode === 'none') {
			if (holdInput) endHold('pointer-inputMode-none');
			rateLimited('prime-none', 3_000, () =>
				diag('ime.prime skip', {
					reason: 'inputMode-none',
					pointerType: event.pointerType,
					...imeSnapshot(parts.input),
				}),
			);
			return;
		}

		// Stop the browser default that moves focus to <body>/canvas. Do not
		// stopPropagation — Qt still needs the pointer to activate the QML field.
		event.preventDefault();

		// Never blur-first: that was killing the Safari session on every tap.
		parts.input.focus({ preventScroll: true });
		const continuing = holdInput === parts.input && keyboardShown();
		if (!continuing) enterStep = 'next';
		beginHold(parts);

		diagFlush('ime.prime', {
			pointerType: event.pointerType,
			mode,
			enterStep,
			continuing,
			afterFocused: deepActiveElement() === parts.input,
			...imeSnapshot(parts.input),
		});
	};

	const onPointerUp = (event: PointerEvent) => {
		if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
		if (!holdInput || (holdInput.inputMode || 'text') === 'none') return;
		// Late Qt/canvas work often steals focus on pointerup; reclaim in-gesture.
		if (deepActiveElement() !== holdInput) {
			holdInput.focus({ preventScroll: true });
			diag('ime.hold pointerup-refocus', imeSnapshot(holdInput));
		}
	};

	const onViewport = () => {
		rateLimited('viewport', 500, () => {
			diag('ime.viewport', imeSnapshot(holdInput));
			if (!keyboardShown()) {
				const input =
					holdInput ??
					document.querySelector<HTMLInputElement>(
						'.qt-window-input-element',
					);
				applyPendingType(input, 'viewport-kb-down');
			}
		});
	};

	screen.addEventListener('pointerdown', onPointerDown, true);
	screen.addEventListener('pointerup', onPointerUp, true);
	screen.addEventListener('pointercancel', onPointerUp, true);
	window.visualViewport?.addEventListener('resize', onViewport);
	window.visualViewport?.addEventListener('scroll', onViewport);

	const mo = new MutationObserver(() => {
		for (const input of document.querySelectorAll<HTMLInputElement>(
			'.qt-window-input-element',
		)) {
			observeImeInput(input);
		}
	});
	mo.observe(document.documentElement, { childList: true, subtree: true });
	for (const input of document.querySelectorAll<HTMLInputElement>(
		'.qt-window-input-element',
	)) {
		observeImeInput(input);
	}

	diag('ime.hooks installed', imeSnapshot());

	return () => {
		screen.removeEventListener('pointerdown', onPointerDown, true);
		screen.removeEventListener('pointerup', onPointerUp, true);
		screen.removeEventListener('pointercancel', onPointerUp, true);
		window.visualViewport?.removeEventListener('resize', onViewport);
		window.visualViewport?.removeEventListener('scroll', onViewport);
		mo.disconnect();
		endHold('uninstall');
	};
};
