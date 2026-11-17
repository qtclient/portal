import { createHash } from 'node:crypto';

export type Frame = {
	module?: string | null;
	function?: string | null;
	file?: string | null;
	line?: number | null;
	/** Hex offset inside the module when unsymbolicated. */
	offset?: string | null;
	/** WASM function index (`wasm-function[N]`), resolved through the symbol map. */
	index?: number | null;
};

const SIGNATURE_FRAMES = 5;

/** Frames that never identify a crash on their own (allocators, abort, Qt asserts). */
const NOISE = [
	/^(abort|raise|__pthread_kill|pthread_kill|_?__assert)/,
	/^(malloc|free|operator new|operator delete|std::terminate)/,
	/^qt_assert|^qFatal|^QMessageLogger::fatal/,
	/^(KiUserExceptionDispatcher|RtlRaiseException|RaiseException)/,
];

export function frameLabel(f: Frame): string {
	const mod = f.module || '?';
	if (f.function) return `${mod}!${f.function}`;
	return `${mod}+${f.offset ?? '?'}`;
}

/** Stable 40-char signature from the top meaningful frames. */
export function signatureOf(frames: Frame[], crashType = ''): string {
	const meaningful = frames.filter(
		(f) => !(f.function && NOISE.some((re) => re.test(f.function!))),
	);
	const picked = (meaningful.length ? meaningful : frames).slice(0, SIGNATURE_FRAMES);
	const text = [crashType, ...picked.map(frameLabel)].join('\n');
	return createHash('sha1').update(text).digest('hex');
}

/** Human title for a crash group. */
export function titleOf(frames: Frame[], crashType: string): string {
	const top = frames.find((f) => f.function) ?? frames[0];
	const where = top ? frameLabel(top) : 'unknown location';
	return `${crashType || 'crash'} in ${where}`.slice(0, 255);
}
