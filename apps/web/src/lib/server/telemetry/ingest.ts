/**
 * Client telemetry ingest.
 *
 * Crash (CIP `crashReportUrl` → /clientservices/crashreceiver.php, and
 * /api/telemetry/crash for /play):
 *   - multipart/form-data: the minidump is the `minidump` part (CIP), or
 *     `upload_file_minidump` (Breakpad/Crashpad), else the largest file; CIP's
 *     `sessiondump` part is stored beside it. Text parts are annotations: CIP
 *     sends ProductName, Version, Timestamp, OperatingSystem, HardwareID,
 *     EngineID, LoginHost, LogMessages, Character, `Comment` and `ReportType`
 *     (`Full` | `Minimal`); `platform` and `revision`/`ver`/`Version` are read
 *     when present.
 *   - application/octet-stream: raw minidump, annotations from the query string.
 *   - application/json: browser/WASM report `{ message, name, stack, stage, revision }`.
 *
 * Hardware (CIP `fpsHistoryRecipient` → /clientservices/hardwarereceiver.php):
 *   JSON object or array. CIP's FPS document is `{ dataType: 1, clientID,
 *   renderer, FPSHistory: [{ maxFPS, minFPS, averageFPS, timeStamp }] }`; it is
 *   flattened into one entry per sample. `dataType: "FPSHistory"` entries carry
 *   `clientID`, `renderer`, `timeStamp` (`yyyy-MM-dd hh:mm:ss,zzz`),
 *   `averageFPS`, `minFPS`, `maxFPS`; anything else is kept as a system survey.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { Prisma } from '@prisma/client';

import { hooks } from '$pack/hooks.server';

import { prisma } from '#lib/server/prisma.js';
import {
	crashMaxBytes,
	hashIp,
	telemetryDir,
	telemetryEnabled,
} from '#lib/server/telemetry/config.js';
import { enqueueReport } from '#lib/server/telemetry/process.js';
import { cipTimestamp, crashRevision, normPlatform, pickCrashParts } from '#lib/server/telemetry/parse.js';
import { allow } from '#lib/server/telemetry/rateLimit.js';

export type IngestContext = {
	request: Request;
	ip: string | null;
	accountId: number | null;
};


function datedPath(id: string, ext: string): string {
	const d = new Date();
	const ymd = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
	return join('dumps', ymd, `${id}.${ext}`);
}

function writeRel(rel: string, data: Uint8Array | string): void {
	const abs = join(telemetryDir(), rel);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, data);
}

const noContent = () => new Response(null, { status: 204 });

function tooLarge(request: Request, max: number): boolean {
	const len = Number(request.headers.get('content-length') ?? 0);
	return Number.isFinite(len) && len > max;
}

export async function ingestCrash(ctx: IngestContext): Promise<Response> {
	const { request } = ctx;
	if (!telemetryEnabled()) return noContent();
	if (!allow(`crash:${ctx.ip ?? '?'}`, 10)) return new Response('rate limited', { status: 429 });
	const max = crashMaxBytes();
	if (tooLarge(request, max)) return new Response('too large', { status: 413 });

	const ua = request.headers.get('user-agent') ?? '';
	const type = (request.headers.get('content-type') ?? '').toLowerCase();
	const url = new URL(request.url);
	const fields: Record<string, string> = Object.fromEntries(url.searchParams);
	const id = randomUUID();
	let platform: string;
	let reportType: string;
	let dumpPath: string;
	let dumpSize: number;
	let sessiondumpPath: string | null = null;

	if (type.includes('application/json')) {
		const text = await request.text();
		if (text.length > max) return new Response('too large', { status: 413 });
		let payload: Record<string, unknown>;
		try {
			payload = JSON.parse(text) as Record<string, unknown>;
		} catch {
			return new Response('bad json', { status: 400 });
		}
		for (const [k, v] of Object.entries(payload)) {
			if (typeof v === 'string') fields[k] = v;
		}
		if (!fields.message && !fields.stack) {
			return new Response('missing message/stack', { status: 400 });
		}
		platform = 'wasm';
		reportType = 'wasm';
		dumpPath = datedPath(id, 'json');
		writeRel(dumpPath, text);
		dumpSize = text.length;
	} else {
		let bytes: Uint8Array | null = null;
		let sessiondump: Uint8Array | null = null;
		if (type.includes('multipart/form-data')) {
			const parts = pickCrashParts((await request.formData()).entries());
			Object.assign(fields, parts.fields);
			if (parts.dump) {
				if (parts.dump.size > max) return new Response('too large', { status: 413 });
				bytes = new Uint8Array(await parts.dump.arrayBuffer());
			}
			if (parts.sessiondump && parts.sessiondump.size > 0 && parts.sessiondump.size <= max) {
				sessiondump = new Uint8Array(await parts.sessiondump.arrayBuffer());
			}
		} else {
			const buf = new Uint8Array(await request.arrayBuffer());
			if (buf.byteLength > max) return new Response('too large', { status: 413 });
			bytes = buf.byteLength ? buf : null;
		}
		if (!bytes) return new Response('missing minidump', { status: 400 });
		// Breakpad/Crashpad minidumps start with "MDMP".
		const magic = String.fromCharCode(...bytes.subarray(0, 4));
		if (magic !== 'MDMP') return new Response('not a minidump', { status: 400 });
		platform = normPlatform(fields.platform ?? fields.os ?? fields.prod ?? fields.OperatingSystem, ua);
		reportType = /^(full|minimal)$/i.test(fields.ReportType ?? '')
			? fields.ReportType[0].toUpperCase() + fields.ReportType.slice(1).toLowerCase()
			: 'Minimal';
		dumpPath = datedPath(id, 'dmp');
		writeRel(dumpPath, bytes);
		dumpSize = bytes.byteLength;
		if (sessiondump) {
			// CIP's session recording rides along; kept beside the dump.
			sessiondumpPath = datedPath(id, 'session');
			writeRel(sessiondumpPath, sessiondump);
		}
	}

	const comment = (fields.Comment ?? fields.comment ?? '').trim().slice(0, 4000) || null;
	const metadata: Record<string, string> = {};
	for (const [k, v] of Object.entries(fields)) {
		if (['Comment', 'comment', 'stack', 'message'].includes(k)) continue;
		metadata[k] = v.slice(0, 512);
	}
	if (sessiondumpPath) metadata.sessiondump_path = sessiondumpPath;

	await prisma.crashReport.create({
		data: {
			id,
			platform,
			revision: crashRevision(request.headers, fields),
			report_type: reportType,
			comment,
			account_id: ctx.accountId,
			ip_hash: hashIp(ctx.ip),
			dump_path: dumpPath,
			dump_size: dumpSize,
			metadata: metadata as Prisma.InputJsonValue,
		},
	});
	enqueueReport(id);
	return Response.json({ id }, { status: 201 });
}

type HardwareEntry = Record<string, unknown>;

function num(v: unknown): number {
	const n = typeof v === 'number' ? v : Number(v);
	return Number.isFinite(n) ? n : 0;
}


function str(v: unknown, max = 255): string | null {
	return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/** CIP TFPSHistoryToJsonConverter document → one `dataType: "FPSHistory"` entry per sample. */
function fpsHistorySamples(e: HardwareEntry): HardwareEntry[] {
	if (e.dataType !== 1 || !Array.isArray(e.FPSHistory)) return [e];
	return e.FPSHistory.filter((s): s is HardwareEntry => !!s && typeof s === 'object').map((s) => ({
		...s,
		dataType: 'FPSHistory',
		clientID: e.clientID,
		renderer: e.renderer === undefined ? undefined : String(e.renderer),
		platform: e.platform,
		revision: e.revision,
	}));
}

export async function ingestHardware(ctx: IngestContext): Promise<Response> {
	const { request } = ctx;
	if (!telemetryEnabled()) return noContent();
	if (!allow(`hw:${ctx.ip ?? '?'}`, 30)) return new Response('rate limited', { status: 429 });
	if (tooLarge(request, 2 * 1024 * 1024)) return new Response('too large', { status: 413 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return new Response('bad json', { status: 400 });
	}
	const entries: HardwareEntry[] = (Array.isArray(body) ? body : [body])
		.filter((e): e is HardwareEntry => !!e && typeof e === 'object')
		.flatMap(fpsHistorySamples);
	const ua = request.headers.get('user-agent') ?? '';
	const revision = crashRevision(request.headers, {});

	const fps: Prisma.FpsSampleCreateManyInput[] = [];
	for (const e of entries.slice(0, 500)) {
		const platform = normPlatform(str(e.platform), ua);
		const rev = str(e.revision, 64) ?? revision;
		if (e.dataType === 'FPSHistory') {
			fps.push({
				platform,
				revision: rev,
				client_id: str(e.clientID, 64),
				renderer: str(e.renderer, 128) ?? 'unknown',
				sampled_at: cipTimestamp(e.timeStamp),
				average_fps: num(e.averageFPS),
				min_fps: num(e.minFPS),
				max_fps: num(e.maxFPS),
			});
			continue;
		}
		await prisma.systemSurvey.create({
			data: {
				platform,
				revision: rev,
				client_id: str(e.clientID, 64),
				gpu: str(e.gpu ?? e.GPU ?? e.renderer),
				cpu: str(e.cpu ?? e.CPU),
				os: str(e.os ?? e.OS),
				raw: e as Prisma.InputJsonValue,
			},
		});
	}
	if (fps.length) {
		await prisma.fpsSample.createMany({ data: fps });
		for (const f of fps) {
			try {
				await hooks.telemetry?.({
					kind: 'fps',
					platform: f.platform,
					revision: f.revision,
					renderer: f.renderer,
					averageFps: f.average_fps,
					minFps: f.min_fps,
					maxFps: f.max_fps,
				});
			} catch (err) {
				console.warn('[telemetry] pack sink failed', err);
				break;
			}
		}
	}
	return noContent();
}
