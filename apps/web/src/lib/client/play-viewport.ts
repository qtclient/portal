/**
 * /play: keep the game canvas inside the *visible* viewport.
 *
 * When the on-screen keyboard opens, iOS Safari (and Chrome with its default
 * `resizes-visual`) shrinks only the visual viewport: a `position: fixed`
 * canvas sized to 100dvh stays full height and the chat input ends up under the
 * keyboard. Following `window.visualViewport` makes the canvas — and with it
 * the client window — shrink to the area above the keyboard, so the client's
 * own layout keeps the chat line visible.
 */
export function installVisualViewportFit(root: HTMLElement): () => void {
	const vv = typeof window !== 'undefined' ? window.visualViewport : null;
	if (!vv) return () => {};

	let frame = 0;
	const apply = () => {
		frame = 0;
		// Pinch zoom is disabled on /play; a scale above 1 means the browser
		// zoomed anyway (accessibility) — leave the layout alone then.
		if (vv.scale > 1.01) {
			root.style.height = '';
			root.style.top = '';
			return;
		}
		const fullHeight = window.innerHeight;
		const keyboardOpen = fullHeight - vv.height > 80;
		root.style.height = keyboardOpen ? `${Math.round(vv.height)}px` : '';
		// iOS scrolls the layout viewport to reveal the focused input.
		root.style.top = keyboardOpen ? `${Math.round(vv.offsetTop)}px` : '';
	};
	const schedule = () => {
		if (!frame) frame = requestAnimationFrame(apply);
	};

	vv.addEventListener('resize', schedule);
	vv.addEventListener('scroll', schedule);
	apply();
	return () => {
		if (frame) cancelAnimationFrame(frame);
		vv.removeEventListener('resize', schedule);
		vv.removeEventListener('scroll', schedule);
		root.style.height = '';
		root.style.top = '';
	};
}
