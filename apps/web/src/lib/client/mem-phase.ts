/**
 * Phase-tagged wasm heap breadcrumbs for Safari jetsam hunts.
 *
 * We cannot yet name the C++ allocator that owns the ~65→800MB climb (that
 * needs qtclient subsystem counters). This layer answers the next question:
 * which engine phase / FS prefix moves in lockstep with each heap jump, so the
 * next paste points at assets vs QML vs sounds vs minimap rather than "world
 * enter" as a blob.
 *
 * - Detect phases from Qt console lines (gameserver / expedition / …).
 * - Sample often after gameUiReady; emit only on phase change or ≥3MB delta.
 * - Bucket tip-fs hotPaths by prefix; put every number in the message string
 *   (Safari collapses nested console objects when copied).
 */

import { diag, diagFlush } from './play-diag';

export type HeapMb = {
	inUse: number | null;
	maxFootprint: number | null;
	sbrkTop: number | null;
	reserved: number | null;
};

export type FsSnap = {
	calls: number;
	ms: number;
	readMb: number | null;
	writtenMb: number | null;
	hotPaths: { key: string; calls: number }[];
};

type Sample = {
	t: number;
	phase: string;
	heap: HeapMb;
	fs: FsSnap | null;
	js: { nodes: number; canvases: number; canvasPx: number };
};

type MemPhaseCtl = {
	notePhase: (phase: string, why: string) => void;
	onGameUiReady: () => void;
	sample: (label: string, force?: boolean) => Promise<void>;
	dispose: () => void;
};

const PHASE_RULES: { re: RegExp; phase: string }[] = [
	{ re: /Request connection to gameserver/i, phase: 'gameserver-request' },
	{ re: /Connected to gameserver/i, phase: 'gameserver-connected' },
	{ re: /\[expedition\.diag\]\s+open\b/i, phase: 'expedition-open' },
	{ re: /\[expedition\.diag\]\s+toggle open=true/i, phase: 'expedition-open' },
	{ re: /\[expedition\.diag\]\s+area activated/i, phase: 'expedition-area' },
	{ re: /\[expedition\.diag\]\s+selectArea/i, phase: 'expedition-area' },
	{ re: /\[expedition\.diag\]\s+attachBrowseMap/i, phase: 'expedition-map' },
	{ re: /Appearances|appearances\.dat|loading appearances/i, phase: 'appearances' },
	{ re: /TSoundController|Play single shot effect/i, phase: 'audio' },
];

function bucketHotPath(key: string): string {
	const k = key.toLowerCase();
	if (k.includes('qtquick') || k.includes('qtqml') || k.includes('.qml'))
		return 'qml';
	if (k.includes('/tibia/assets') || k.includes('/assets/') || k.includes('appearances'))
		return 'assets';
	if (k.includes('sound') || k.includes('.ogg') || k.includes('music'))
		return 'audio';
	if (k.includes('minimap') || k.includes('expedition')) return 'map';
	if (k.includes('.config') || k.includes('.ini') || k.includes('options.json'))
		return 'config';
	if (k.includes('/packages/') || k.includes('package.json')) return 'pack';
	if (k.includes('/resources')) return 'resources';
	return 'other';

}

function hotBuckets(
	paths: { key: string; calls: number }[],
): string {
	const counts: Record<string, number> = {};
	for (const p of paths) {
		const b = bucketHotPath(p.key);
		counts[b] = (counts[b] ?? 0) + p.calls;
	}
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 6)
		.map(([k, v]) => `${k}:${v}`)
		.join(',') || 'none';
}

function jsDomSnap(): Sample['js'] {
	let canvasPx = 0;
	let canvases = 0;
	try {
		for (const c of document.querySelectorAll('canvas')) {
			canvases += 1;
			canvasPx += (c.width || 0) * (c.height || 0);
		}
	} catch {
		/* ignore */
	}
	let nodes = 0;
	try {
		nodes = document.getElementsByTagName('*').length;
	} catch {
		/* ignore */
	}
	return { nodes, canvases, canvasPx };
}

function fmtHeap(h: HeapMb): string {
	return `inUse=${h.inUse}MB maxFootprint=${h.maxFootprint}MB sbrkTop=${h.sbrkTop}MB reserved=${h.reserved}MB`;
}

function delta(a: number | null, b: number | null): string {
	if (a === null || b === null) return '?';
	const d = Math.round((a - b) * 10) / 10;
	return d >= 0 ? `+${d}` : `${d}`;
}

function significantJump(prev: HeapMb | null, next: HeapMb): boolean {
	if (!prev) return true;
	const fields: (keyof HeapMb)[] = ['inUse', 'maxFootprint', 'sbrkTop'];
	for (const f of fields) {
		const a = prev[f];
		const b = next[f];
		if (a === null || b === null) continue;
		if (Math.abs(b - a) >= 3) return true;
	}
	return false;
}

/**
 * Install phase tracking. `readHeap` / `readFs` come from tibia-browser so we
 * reuse the same Module.qtclientHeap / qtclient-fs Worker path.
 */
export function installMemPhase(opts: {
	readHeap: () => HeapMb;
	readFs: () => Promise<FsSnap | null>;
}): MemPhaseCtl {
	let phase = 'boot';
	let baseline: Sample | null = null;
	let last: Sample | null = null;
	let lastEmitted: Sample | null = null;
	let denseTimer: ReturnType<typeof setInterval> | null = null;
	let disposed = false;
	const pendingPhaseWhy: string[] = [];

	const takeSample = async (label: string): Promise<Sample> => {
		const heap = opts.readHeap();
		let fs: FsSnap | null = null;
		try {
			fs = await opts.readFs();
		} catch {
			fs = null;
		}
		return {
			t: Math.round(performance.now()),
			phase,
			heap,
			fs,
			js: jsDomSnap(),
		};
	};

	const emit = (label: string, sample: Sample, force: boolean) => {
		if (
			!force &&
			lastEmitted &&
			lastEmitted.phase === sample.phase &&
			!significantJump(lastEmitted.heap, sample.heap)
		) {
			return;
		}
		const base = baseline;
		const prev = lastEmitted;
		const fs = sample.fs;
		const buckets = fs ? hotBuckets(fs.hotPaths) : 'fs=?';
		const hotTop = fs?.hotPaths
			?.slice(0, 4)
			.map((p) => `${p.key}×${p.calls}`)
			.join(', ');
		const line =
			`mem.${label} phase=${sample.phase} ${fmtHeap(sample.heap)}` +
			(base
				? ` | Δready inUse=${delta(sample.heap.inUse, base.heap.inUse)} max=${delta(sample.heap.maxFootprint, base.heap.maxFootprint)}`
				: '') +
			(prev
				? ` | Δprev inUse=${delta(sample.heap.inUse, prev.heap.inUse)} max=${delta(sample.heap.maxFootprint, prev.heap.maxFootprint)}`
				: '') +
			(fs
				? ` | fs read=${fs.readMb}MB written=${fs.writtenMb}MB calls=${fs.calls}` +
					(prev?.fs
						? ` Δread=${delta(fs.readMb, prev.fs.readMb)}MB`
						: '')
				: '') +
			` | buckets ${buckets}` +
			(hotTop ? ` | hot ${hotTop}` : '') +
			` | dom nodes=${sample.js.nodes} canvas=${sample.js.canvases} px=${sample.js.canvasPx}`;
		const flush = label === 'phase' || label === 'pagehide' || label === 'ready';
		(flush ? diagFlush : diag)(line, {
			phase: sample.phase,
			why: pendingPhaseWhy.splice(0).join('|') || undefined,
		});
		lastEmitted = sample;
	};

	const sample = async (label: string, force = false) => {
		if (disposed) return;
		const s = await takeSample(label);
		last = s;
		emit(label, s, force);
	};

	const notePhase = (next: string, why: string) => {
		if (disposed || next === phase) return;
		phase = next;
		pendingPhaseWhy.push(why.slice(0, 120));
		void sample('phase', true);
	};

	const onConsole = (...args: unknown[]) => {
		const text = args
			.map((a) => (typeof a === 'string' ? a : ''))
			.join(' ');
		if (!text) return;
		for (const rule of PHASE_RULES) {
			if (rule.re.test(text)) {
				notePhase(rule.phase, text.replace(/\s+/g, ' ').slice(0, 160));
				return;
			}
		}
	};

	const origLog = console.log.bind(console);
	const origInfo = console.info.bind(console);
	console.log = (...args: unknown[]) => {
		try {
			onConsole(...args);
		} catch {
			/* ignore */
		}
		return origLog(...args);
	};
	console.info = (...args: unknown[]) => {
		try {
			onConsole(...args);
		} catch {
			/* ignore */
		}
		return origInfo(...args);
	};

	const onPageHide = () => {
		void (async () => {
			try {
				const s = await takeSample('pagehide');
				last = s;
				emit('pagehide', s, true);
			} catch {
				if (last) emit('pagehide', last, true);
			}
		})();
	};
	window.addEventListener('pagehide', onPageHide);

	const onGameUiReady = () => {
		phase = 'login-ready';
		void (async () => {
			const s = await takeSample('ready');
			baseline = s;
			last = s;
			emit('ready', s, true);
		})();
		// Dense window covering world-enter → first expedition use.
		if (denseTimer) clearInterval(denseTimer);
		let ticks = 0;
		denseTimer = setInterval(() => {
			ticks += 1;
			void sample('tick');
			// 5s × 36 = 3 minutes
			if (ticks >= 36 && denseTimer) {
				clearInterval(denseTimer);
				denseTimer = null;
				diag('mem.dense-end', { phase });
			}
		}, 5_000);
	};

	return {
		notePhase,
		onGameUiReady,
		sample,
		dispose: () => {
			disposed = true;
			console.log = origLog;
			console.info = origInfo;
			window.removeEventListener('pagehide', onPageHide);
			if (denseTimer) clearInterval(denseTimer);
			denseTimer = null;
		},
	};
}
