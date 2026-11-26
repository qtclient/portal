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
 *
 * Diag breadcrumbs (`ime.*`, `pointerCapture.*`) go through play.diag so the
 * next Safari boot can dump what happened before a kill/reload.
 */

import { diag, diagFlush, diagWarn } from './play-diag';

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
		focused: !!(el && deepActiveElement() === el),
	};
}

const guardedInputs = new WeakSet<HTMLInputElement>();
const observedInputs = new WeakSet<HTMLInputElement>();

/** Rate-limit chatty breadcrumbs so a drag/flick does not flood sessionStorage. */
function rateLimited(
	key: string,
	minMs: number,
	fn: () => void,
): void {
	const g = globalThis as unknown as {
		__qtImeDiagAt?: Record<string, number>;
	};
	const stamp = (g.__qtImeDiagAt ??= {});
	const now = performance.now();
	if ((stamp[key] ?? 0) + minMs > now) return;
	stamp[key] = now;
	fn();
}

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
				diag('ime.type deferred', {
					from: desc.get!.call(this),
					to: next,
					...imeSnapshot(input),
				});
				return;
			}
			if (desc.get!.call(this) !== next) {
				diag('ime.type set', {
					from: desc.get!.call(this),
					to: next,
					focused: deepActiveElement() === this,
					...imeSnapshot(input),
				});
			}
			pending = null;
			desc.set!.call(this, next);
		},
	});
	input.addEventListener('blur', () => {
		if (pending === null) return;
		const next = pending;
		pending = null;
		diag('ime.type apply-on-blur', { to: next, ...imeSnapshot(input) });
		desc.set!.call(input, next);
	});
}

function observeImeInput(input: HTMLInputElement): void {
	if (observedInputs.has(input)) return;
	observedInputs.add(input);
	guardInputTypeWhileFocused(input);

	const onFocus = () =>
		diag('ime.focus', imeSnapshot(input), { flush: true });
	const onBlur = () => diag('ime.blur', imeSnapshot(input), { flush: true });
	input.addEventListener('focus', onFocus);
	input.addEventListener('blur', onBlur);
	// inputMode changes (Qt switching helper ↔ text field) are a common
	// keyboard-kill signal on iOS.
	const mo = new MutationObserver((records) => {
		for (const r of records) {
			if (r.type === 'attributes' && r.attributeName === 'inputmode') {
				diag('ime.inputMode', {
					value: input.inputMode || 'text',
					...imeSnapshot(input),
				});
			}
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
				err: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
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
	let lastPrimeAt = 0;
	const onPointerDown = (event: PointerEvent) => {
		if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
		const parts = qtWindowParts(event);
		if (!parts) {
			rateLimited('prime-no-qt', 5_000, () =>
				diag('ime.prime skip', {
					reason: 'no-qt-window',
					pointerType: event.pointerType,
				}),
			);
			return;
		}

		observeImeInput(parts.input);

		const shown = keyboardShown();
		const mode = parts.input.inputMode || 'text';
		const alreadyFocused = deepActiveElement() === parts.input;
		const snap = {
			pointerType: event.pointerType,
			mode,
			alreadyFocused,
			shown,
			...imeSnapshot(parts.input),
		};

		if (shown) {
			rateLimited('prime-shown', 2_000, () =>
				diag('ime.prime skip', { reason: 'keyboard-shown', ...snap }),
			);
			return;
		}
		// Qt has not asked for text input yet (focus helper owns the window).
		// Do not invent a session — a blind focus() opens the keyboard on every
		// map tap. Login forceActiveFocus configures inputMode before the tap.
		if (mode === 'none') {
			// Login taps that land while inputMode is still "none" are the
			// interesting case — always log those, rate-limit map noise.
			const interesting =
				event.target instanceof Element &&
				!event.target.closest?.('canvas');
			if (interesting) {
				diag('ime.prime skip', { reason: 'inputMode-none', ...snap });
			} else {
				rateLimited('prime-none', 3_000, () =>
					diag('ime.prime skip', { reason: 'inputMode-none', ...snap }),
				);
			}
			return;
		}

		// Already focused from Qt's late focus() (no keyboard): blur+focus inside
		// the gesture starts a real Safari input session.
		if (alreadyFocused) parts.input.blur();
		parts.input.focus({ preventScroll: true });
		const now = performance.now();
		const gap = lastPrimeAt ? Math.round(now - lastPrimeAt) : null;
		lastPrimeAt = now;
		diagFlush('ime.prime', {
			...snap,
			didBlurFirst: alreadyFocused,
			afterFocused: deepActiveElement() === parts.input,
			gapMs: gap,
		});
	};

	const onViewport = () => {
		rateLimited('viewport', 500, () => diag('ime.viewport', imeSnapshot()));
	};

	// Capture: still on the user-gesture stack, before Qt's queued handler.
	screen.addEventListener('pointerdown', onPointerDown, true);
	window.visualViewport?.addEventListener('resize', onViewport);
	window.visualViewport?.addEventListener('scroll', onViewport);

	// Catch Qt creating/replacing the IME input after boot.
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
		window.visualViewport?.removeEventListener('resize', onViewport);
		window.visualViewport?.removeEventListener('scroll', onViewport);
		mo.disconnect();
	};
};
