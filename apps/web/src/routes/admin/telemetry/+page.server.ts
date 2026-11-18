import { prisma } from '#lib/server/prisma.js';

import type { PageServerLoad } from './$types';

type FpsRow = {
	revision: string;
	platform: string;
	renderer: string;
	samples: bigint | number;
	avg_fps: number;
	min_fps: number;
	max_fps: number;
};

type CountRow = { label: string | null; n: bigint | number };

type GateRow = {
	browser: string | null;
	version: string | null;
	os: string | null;
	engine: string | null;
	reason: string | null;
	n: bigint | number;
};

// /play gate records are surveys with `raw.dataType = "BrowserGate"`
// (lib/client/browser-floor.ts); keep them out of the GPU list.
const GATE = 'BrowserGate';

export const load = (async ({ url }) => {
	const days = Math.min(
		90,
		Math.max(1, Number(url.searchParams.get('days') ?? 14) || 14),
	);
	const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

	const fps = await prisma.$queryRaw<FpsRow[]>`
		SELECT revision, platform, renderer, COUNT(*) AS samples,
			AVG(average_fps) AS avg_fps, AVG(min_fps) AS min_fps, AVG(max_fps) AS max_fps
		FROM qtcaac_fps_samples
		WHERE created_at >= ${since}
		GROUP BY revision, platform, renderer
		ORDER BY revision DESC, samples DESC
		LIMIT 200`;

	const gpus = await prisma.$queryRaw<CountRow[]>`
		SELECT gpu AS label, COUNT(*) AS n FROM qtcaac_system_surveys
		WHERE created_at >= ${since}
			AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw, '$.dataType')), '') <> ${GATE}
		GROUP BY gpu ORDER BY n DESC LIMIT 25`;

	const platforms = await prisma.$queryRaw<CountRow[]>`
		SELECT platform AS label, COUNT(*) AS n FROM qtcaac_crash_reports
		WHERE created_at >= ${since}
		GROUP BY platform ORDER BY n DESC`;

	const gate = await prisma.$queryRaw<GateRow[]>`
		SELECT
			JSON_UNQUOTE(JSON_EXTRACT(raw, '$.browser')) AS browser,
			JSON_UNQUOTE(JSON_EXTRACT(raw, '$.browserVersion')) AS version,
			JSON_UNQUOTE(JSON_EXTRACT(raw, '$.os')) AS os,
			JSON_UNQUOTE(JSON_EXTRACT(raw, '$.engine')) AS engine,
			JSON_UNQUOTE(JSON_EXTRACT(raw, '$.reason')) AS reason,
			COUNT(*) AS n
		FROM qtcaac_system_surveys
		WHERE created_at >= ${since}
			AND JSON_UNQUOTE(JSON_EXTRACT(raw, '$.dataType')) = ${GATE}
		GROUP BY browser, version, os, engine, reason
		ORDER BY n DESC
		LIMIT 100`;

	return {
		title: 'Telemetry',
		days,
		fps: fps.map((r) => ({
			...r,
			samples: Number(r.samples),
			avg_fps: Number(r.avg_fps),
			min_fps: Number(r.min_fps),
			max_fps: Number(r.max_fps),
		})),
		gpus: gpus.map((r) => ({ label: r.label ?? 'unknown', n: Number(r.n) })),
		gate: gate.map((r) => ({
			browser: r.browser ?? 'unknown',
			version: r.version && r.version !== 'null' ? r.version : '?',
			os: r.os ?? 'unknown',
			engine: r.engine ?? 'unknown',
			reason: r.reason ?? 'unknown',
			n: Number(r.n),
		})),
		crashPlatforms: platforms.map((r) => ({
			label: r.label ?? 'unknown',
			n: Number(r.n),
		})),
	};
}) satisfies PageServerLoad;
