/**
 * Reliable iOS Safari keyboard for Qt wasm text fields.
 *
 * Why a plain tap fails but "press + drag + release" works:
 * Safari only keeps the keyboard for a focus() that stays inside a user
 * gesture without a later blur. Qt's 1×1 `.qt-window-input-element` sits under
 * the canvas (z-index -2), so the tap hits the canvas; Qt/JSPI then blurs the
 * input (focus helper / body). Our programmatic re-focus is outside the
 * gesture → element focused, keyboard gone. A drag keeps the gesture alive
 * until release, so the session sticks.
 *
 * Fix: when Qt wants text (inputMode !== "none"), enlarge that input into a
 * real opacity-0.01 hit target over the field, lock the focus helper, and let
 * the finger hit the actual <input>. Native Safari keyboard; no canvas steal.
 * Canvas taps outside that hit target (Login, etc.) are left alone.
 *
 * Next/Go: enterkeyhint next → Tab (KeyNavigation), then go → Enter (login).
 * Never set autocomplete — Safari password AutoFill remounts /play.
 *
 * Also: guard releasePointerCapture NotFoundError (WASM abort on iOS).
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

function partsForInput(input: HTMLInputElement): QtWindowParts | null {
	const win = input.closest<HTMLElement>('.qt-window');
	if (!win) return null;
	const helper = win.querySelector<HTMLElement>(':scope > .qt-window-focus-helper');
	return helper ? { input, helper, window: win } : null;
}

function deepActiveElement(): Element | null {
	let active = document.activeElement;
	while (active?.shadowRoot?.activeElement)
		active = active.shadowRoot.activeElement;
	return active;
}

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
	const box = el?.getBoundingClientRect();
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
		box: box
			? `${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.left)},${Math.round(box.top)}`
			: null,
	};
}

const guardedInputs = new WeakSet<HTMLInputElement>();
const observedInputs = new WeakSet<HTMLInputElement>();
const expandedInputs = new WeakSet<HTMLInputElement>();

let holdInput: HTMLInputElement | null = null;
let holdHelper: HTMLElement | null = null;
let holdWindow: HTMLElement | null = null;
let enterStep: 'next' | 'go' = 'next';
let pendingType: string | null = null;
let typeDesc: PropertyDescriptor | null = null;
/** pointerdown that still needs a gesture-safe focus on pointerup */
let pendingWake: QtWindowParts | null = null;

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

/** Put a real finger-sized hit target over the QML field (Qt leaves 1×1 @ -2). */
function expandInput(input: HTMLInputElement): void {
	const style = input.style;
	style.setProperty('opacity', '0.01', 'important');
	style.setProperty('z-index', '1000', 'important');
	style.setProperty('pointer-events', 'auto', 'important');
	style.setProperty('font-size', '16px', 'important'); // no Safari zoom
	style.setProperty('height', '44px', 'important');
	style.setProperty('width', 'min(320px, calc(100vw - 24px))', 'important');
	style.setProperty('border', '0', 'important');
	style.setProperty('padding', '0', 'important');
	style.setProperty('margin', '0', 'important');
	style.setProperty('background', 'transparent', 'important');
	style.setProperty('color', 'transparent', 'important');
	style.setProperty('caret-color', 'transparent', 'important');
	input.setAttribute('contenteditable', 'false');
	if (!expandedInputs.has(input)) {
		expandedInputs.add(input);
		diag('ime.expand', imeSnapshot(input));
	}
}

function shrinkInput(input: HTMLInputElement): void {
	const style = input.style;
	for (const prop of [
		'opacity',
		'z-index',
		'pointer-events',
		'font-size',
		'height',
		'width',
		'border',
		'padding',
		'margin',
		'background',
		'color',
		'caret-color',
	]) {
		style.removeProperty(prop);
	}
	// Restore Qt defaults.
	style.opacity = '0';
	style.zIndex = '-2';
	style.width = '1px';
	style.height = '1px';
	input.setAttribute('contenteditable', 'true');
	expandedInputs.delete(input);
}

function lockHelper(helper: HTMLElement): void {
	helper.setAttribute('contenteditable', 'false');
	helper.tabIndex = -1;
	helper.style.setProperty('pointer-events', 'none', 'important');
}

function unlockHelper(helper: HTMLElement): void {
	helper.setAttribute('contenteditable', 'true');
	helper.removeAttribute('tabIndex');
	helper.style.removeProperty('pointer-events');
}

function endHold(reason: string): void {
	if (!holdInput && !holdWindow) return;
	const input = holdInput;
	const helper = holdHelper;
	diag('ime.hold end', { reason, ...imeSnapshot(input) });
	holdInput = null;
	holdHelper = null;
	holdWindow = null;
	pendingWake = null;
	enterStep = 'next';
	if (helper) unlockHelper(helper);
	if (input) shrinkInput(input);
	if (!keyboardShown()) applyPendingType(input, 'hold-end');
}

function beginHold(parts: QtWindowParts): void {
	if (holdHelper && holdHelper !== parts.helper) unlockHelper(holdHelper);
	if (holdInput && holdInput !== parts.input) shrinkInput(holdInput);
	holdInput = parts.input;
	holdHelper = parts.helper;
	holdWindow = parts.window;
	expandInput(parts.input);
	lockHelper(parts.helper);
	syncEnterKeyHint(parts.input);
	diagFlush('ime.hold begin', { enterStep, ...imeSnapshot(parts.input) });
}

function syncEnterKeyHint(input: HTMLInputElement): void {
	const hint = enterStep === 'go' ? 'go' : 'next';
	// Never set autocomplete — iOS Password AutoFill remounts the page.
	if (input.autocomplete && input.autocomplete !== 'off') {
		input.autocomplete = 'off';
	}
	if (input.enterKeyHint !== hint) {
		input.enterKeyHint = hint;
		diag('ime.enterKeyHint', { hint, ...imeSnapshot(input) });
	}
}

function tapHitsInput(event: PointerEvent, input: HTMLInputElement): boolean {
	if (event.composedPath().includes(input)) return true;
	const r = input.getBoundingClientRect();
	if (r.width < 8 || r.height < 8) return false;
	return (
		event.clientX >= r.left &&
		event.clientX <= r.right &&
		event.clientY >= r.top &&
		event.clientY <= r.bottom
	);
}

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
	input.autocomplete = 'off';

	input.addEventListener('focus', () => {
		diag('ime.focus', imeSnapshot(input), { flush: true });
		const parts = partsForInput(input);
		if ((input.inputMode || 'text') !== 'none' && parts) {
			expandInput(input);
			lockHelper(parts.helper);
			if (!holdInput) beginHold(parts);
			else syncEnterKeyHint(input);
		}
	});

	// Do NOT programmatic-refocus on blur: that is outside the user gesture and
	// Safari keeps focus but drops the keyboard (the tap-vs-drag symptom).
	input.addEventListener('blur', () => {
		diag('ime.blur', imeSnapshot(input), { flush: true });
		if ((input.inputMode || 'text') === 'none') {
			endHold('inputMode-none');
			return;
		}
		applyPendingType(input, 'blur');
	});

	input.addEventListener(
		'pointerdown',
		(event) => {
			if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
			// Finger is on the real <input> — native Safari keyboard path.
			const parts = partsForInput(input);
			if (!parts || (input.inputMode || 'text') === 'none') return;
			event.stopPropagation(); // keep Qt/canvas from stealing this gesture
			const continuing = holdInput === input && keyboardShown();
			if (!continuing) enterStep = 'next';
			beginHold(parts);
			pendingWake = parts;
			diagFlush('ime.native-pointer', {
				enterStep,
				...imeSnapshot(input),
			});
		},
		true,
	);

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
			queueMicrotask(() => {
				if ((input.inputMode || 'text') !== 'none') {
					expandInput(input);
					input.focus({ preventScroll: true });
				}
			});
			return;
		}

		diagFlush('ime.go → Enter', imeSnapshot(input));
		dispatchQtKey(qtWindow, 'Enter', 'Enter', 13);
	});

	const mo = new MutationObserver((records) => {
		for (const r of records) {
			if (r.type !== 'attributes') continue;
			if (r.attributeName === 'inputmode') {
				const mode = input.inputMode || 'text';
				diag('ime.inputMode', { value: mode, ...imeSnapshot(input) });
				const parts = partsForInput(input);
				if (mode === 'none') endHold('inputMode-attr-none');
				else if (parts) {
					expandInput(input);
					lockHelper(parts.helper);
					if (holdInput === input) syncEnterKeyHint(input);
				}
			}
			if (r.attributeName === 'style' && (input.inputMode || 'text') !== 'none') {
				// Qt updateGeometry resets 1×1 — put the hit target back.
				expandInput(input);
			}
		}
	});
	mo.observe(input, {
		attributes: true,
		attributeFilter: ['inputmode', 'style'],
	});
}

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
			pendingWake = null;
			return;
		}

		observeImeInput(parts.input);

		const mode = parts.input.inputMode || 'text';
		if (mode === 'none') {
			if (holdInput) endHold('pointer-inputMode-none');
			pendingWake = null;
			return;
		}

		// Already on the expanded <input> — native handler owns this gesture.
		if (event.composedPath().includes(parts.input)) return;

		// Keyboard up: leave the gesture to Qt (Login button, other chrome).
		if (keyboardShown()) {
			pendingWake = null;
			rateLimited('prime-kb', 2_000, () =>
				diag('ime.prime skip', { reason: 'keyboard-shown', ...imeSnapshot(parts.input) }),
			);
			return;
		}

		expandInput(parts.input);
		lockHelper(parts.helper);

		const onField = tapHitsInput(event, parts.input);
		if (!onField) {
			// Canvas tap outside the field hit target (e.g. Login) — do not steal.
			pendingWake = null;
			diag('ime.prime skip', {
				reason: 'outside-field',
				...imeSnapshot(parts.input),
			});
			return;
		}

		// Field hit via canvas coordinates: claim the gesture so Qt cannot blur
		// us mid-tap, then focus on pointerup (still a user gesture on iOS).
		event.preventDefault();
		event.stopPropagation();
		const continuing = holdInput === parts.input && keyboardShown();
		if (!continuing) enterStep = 'next';
		beginHold(parts);
		pendingWake = parts;
		parts.input.focus({ preventScroll: true });
		diagFlush('ime.prime', {
			pointerType: event.pointerType,
			path: 'canvas-field',
			enterStep,
			...imeSnapshot(parts.input),
		});
	};

	const onPointerUp = (event: PointerEvent) => {
		if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
		const parts = pendingWake;
		pendingWake = null;
		if (!parts) return;
		if ((parts.input.inputMode || 'text') === 'none') return;
		// pointerup is still a user gesture — this is what makes drag-release work.
		expandInput(parts.input);
		parts.input.focus({ preventScroll: true });
		diag('ime.wake pointerup', imeSnapshot(parts.input), { flush: true });
	};

	const onFocusIn = (event: FocusEvent) => {
		if (!holdHelper || !holdInput) return;
		if (event.target !== holdHelper) return;
		if ((holdInput.inputMode || 'text') === 'none') return;
		// Bounce helper → input without waiting for blur churn.
		holdInput.focus({ preventScroll: true });
		diag('ime.helper-bounce', imeSnapshot(holdInput));
	};

	const onViewport = () => {
		rateLimited('viewport', 500, () => {
			diag('ime.viewport', imeSnapshot(holdInput));
			if (!keyboardShown()) {
				applyPendingType(
					holdInput ??
						document.querySelector<HTMLInputElement>(
							'.qt-window-input-element',
						),
					'viewport-kb-down',
				);
			}
		});
	};

	screen.addEventListener('pointerdown', onPointerDown, true);
	screen.addEventListener('pointerup', onPointerUp, true);
	screen.addEventListener('pointercancel', onPointerUp, true);
	document.addEventListener('focusin', onFocusIn, true);
	window.visualViewport?.addEventListener('resize', onViewport);
	window.visualViewport?.addEventListener('scroll', onViewport);

	const mo = new MutationObserver(() => {
		for (const input of document.querySelectorAll<HTMLInputElement>(
			'.qt-window-input-element',
		)) {
			observeImeInput(input);
			if ((input.inputMode || 'text') !== 'none') {
				const parts = partsForInput(input);
				if (parts) {
					expandInput(input);
					lockHelper(parts.helper);
				}
			}
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
		document.removeEventListener('focusin', onFocusIn, true);
		window.visualViewport?.removeEventListener('resize', onViewport);
		window.visualViewport?.removeEventListener('scroll', onViewport);
		mo.disconnect();
		endHold('uninstall');
	};
};
