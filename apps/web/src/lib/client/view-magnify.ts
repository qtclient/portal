/**
 * CSS magnify on #tibia-screen (OTUI shell OTC_VIEW_GESTURE).
 * Does not resize the Qt play box — uiScale stays independent.
 * Only two-finger pinch / ctrl+wheel own the pointer; single-finger stays with Qt.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const WHEEL_STEP = 0.08;

type Point = { x: number; y: number };

function dist(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function touchPoint(t: Touch): Point {
	return { x: t.clientX, y: t.clientY };
}

/** Client point → coords in the screen's untransformed parent space. */
function toParentLocal(screen: HTMLElement, client: Point): Point {
	const parent = screen.parentElement;
	const rect = (parent ?? screen).getBoundingClientRect();
	return { x: client.x - rect.left, y: client.y - rect.top };
}

export function attachViewMagnify(screen: HTMLElement): () => void {
	let scale = 1;
	let tx = 0;
	let ty = 0;
	let pinchStartDist = 0;
	let pinchStartScale = 1;
	let pinchStartMid: Point | null = null;
	let pinchStartTx = 0;
	let pinchStartTy = 0;
	let active = false;

	const setGesture = (on: boolean) => {
		active = on;
		window.OTC_VIEW_GESTURE = on;
	};

	const apply = () => {
		if (scale <= MIN_SCALE + 0.001) {
			scale = 1;
			tx = 0;
			ty = 0;
			screen.style.transform = '';
			screen.style.transformOrigin = '';
			return;
		}
		screen.style.transformOrigin = '0 0';
		screen.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
	};

	/** Keep the parent-local point under `local` fixed while changing scale. */
	const zoomAt = (local: Point, nextScale: number) => {
		const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
		const sx = scale > 0.001 ? (local.x - tx) / scale : local.x;
		const sy = scale > 0.001 ? (local.y - ty) / scale : local.y;
		scale = clamped;
		if (scale <= MIN_SCALE + 0.001) {
			scale = 1;
			tx = 0;
			ty = 0;
		} else {
			tx = local.x - sx * scale;
			ty = local.y - sy * scale;
		}
		apply();
	};

	const onTouchStart = (ev: TouchEvent) => {
		if (ev.touches.length !== 2) return;
		const a = toParentLocal(screen, touchPoint(ev.touches[0]));
		const b = toParentLocal(screen, touchPoint(ev.touches[1]));
		pinchStartDist = dist(a, b);
		pinchStartScale = scale;
		pinchStartMid = mid(a, b);
		pinchStartTx = tx;
		pinchStartTy = ty;
		setGesture(true);
	};

	const onTouchMove = (ev: TouchEvent) => {
		if (ev.touches.length !== 2 || !pinchStartMid || pinchStartDist < 1) return;
		// Two-finger only — never preventDefault on single-finger paths.
		ev.preventDefault();
		const a = toParentLocal(screen, touchPoint(ev.touches[0]));
		const b = toParentLocal(screen, touchPoint(ev.touches[1]));
		const d = dist(a, b);
		const m = mid(a, b);
		const next = Math.min(
			MAX_SCALE,
			Math.max(MIN_SCALE, pinchStartScale * (d / pinchStartDist)),
		);
		const sx =
			pinchStartScale > 0.001
				? (pinchStartMid.x - pinchStartTx) / pinchStartScale
				: pinchStartMid.x;
		const sy =
			pinchStartScale > 0.001
				? (pinchStartMid.y - pinchStartTy) / pinchStartScale
				: pinchStartMid.y;
		scale = next;
		if (scale <= MIN_SCALE + 0.001) {
			scale = 1;
			tx = 0;
			ty = 0;
		} else {
			tx = m.x - sx * scale;
			ty = m.y - sy * scale;
		}
		apply();
	};

	const onTouchEnd = (ev: TouchEvent) => {
		if (ev.touches.length >= 2) return;
		if (active) setGesture(false);
		pinchStartMid = null;
		pinchStartDist = 0;
	};

	const onWheel = (ev: WheelEvent) => {
		if (!ev.ctrlKey && !ev.metaKey) return;
		ev.preventDefault();
		const local = toParentLocal(screen, { x: ev.clientX, y: ev.clientY });
		const delta = ev.deltaY > 0 ? -WHEEL_STEP : WHEEL_STEP;
		zoomAt(local, scale + delta);
	};

	screen.addEventListener('touchstart', onTouchStart, { passive: true });
	screen.addEventListener('touchmove', onTouchMove, { passive: false });
	screen.addEventListener('touchend', onTouchEnd, { passive: true });
	screen.addEventListener('touchcancel', onTouchEnd, { passive: true });
	screen.addEventListener('wheel', onWheel, { passive: false });

	return () => {
		setGesture(false);
		screen.removeEventListener('touchstart', onTouchStart);
		screen.removeEventListener('touchmove', onTouchMove);
		screen.removeEventListener('touchend', onTouchEnd);
		screen.removeEventListener('touchcancel', onTouchEnd);
		screen.removeEventListener('wheel', onWheel);
		screen.style.transform = '';
		screen.style.transformOrigin = '';
	};
}
