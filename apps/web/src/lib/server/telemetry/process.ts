import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Prisma } from '@prisma/client';

import { hooks } from '$pack/hooks.server';

import { prisma } from '#lib/server/prisma.js';
import { telemetryDir } from '#lib/server/telemetry/config.js';
import { signatureOf, titleOf } from '#lib/server/telemetry/signature.js';
import {
	type Symbolicated,
	symbolicateMinidump,
	symbolicateWasm,
	type WasmCrashPayload,
} from '#lib/server/telemetry/symbolicate.js';

/** Serial queue so a crash burst never spawns dozens of stackwalk processes. */
let queue: Promise<void> = Promise.resolve();

export function enqueueReport(id: string): void {
	queue = queue
		.then(() => processReport(id))
		.catch((err) => console.warn('[telemetry] process failed', id, err));
}

async function symbolicate(report: {
	platform: string;
	revision: string;
	dump_path: string | null;
}): Promise<Symbolicated | null> {
	if (!report.dump_path) return null;
	if (report.platform === 'wasm') {
		const payload = JSON.parse(
			readFileSync(join(telemetryDir(), report.dump_path), 'utf8'),
		) as WasmCrashPayload;
		return symbolicateWasm(payload, report.revision);
	}
	return symbolicateMinidump(report.dump_path);
}

export async function processReport(id: string): Promise<void> {
	const report = await prisma.crashReport.findUnique({ where: { id } });
	if (!report) return;
	// A minimal report (annotations only, no minidump) has nothing to symbolicate.
	if (!report.dump_path) {
		if (report.status === 'pending')
			await prisma.crashReport.update({ where: { id }, data: { status: 'unsymbolicated' } });
		return;
	}

	let result: Symbolicated | null;
	try {
		result = await symbolicate(report);
	} catch (err) {
		await prisma.crashReport.update({
			where: { id },
			data: {
				status: 'failed',
				metadata: {
					...(report.metadata as object | null),
					error: err instanceof Error ? err.message : String(err),
				},
			},
		});
		return;
	}
	if (!result) return;

	const signature = signatureOf(result.frames, result.crashType);
	// Reprocessing a report that already sits in this group must not recount it.
	const alreadyCounted = report.signature === signature && !!report.group_id;
	const now = new Date();
	const group = await prisma.crashGroup.upsert({
		where: { signature },
		create: {
			signature,
			title: titleOf(result.frames, result.crashType),
			platform: report.platform,
			first_seen: report.created_at,
			last_seen: report.created_at,
			count: 1,
			last_revision: report.revision,
		},
		update: {
			last_seen: now,
			last_revision: report.revision,
			count: alreadyCounted ? undefined : { increment: 1 },
			// A crash that comes back after being resolved is a regression.
			resolved: false,
		},
	});
	if (!alreadyCounted && report.group_id && report.group_id !== group.id) {
		// Symbols arrived and the report regrouped: drop it from the old group,
		// and drop the old group once nothing points at it.
		await prisma.crashGroup.update({
			where: { id: report.group_id },
			data: { count: { decrement: 1 } },
		});
		await prisma.crashGroup.deleteMany({
			where: { id: report.group_id, count: { lte: 0 } },
		});
	}

	await prisma.crashReport.update({
		where: { id },
		data: {
			status: result.resolved ? 'symbolicated' : 'unsymbolicated',
			signature,
			crash_type: result.crashType.slice(0, 128),
			frames: result.frames as unknown as Prisma.InputJsonValue,
			metadata: {
				...(report.metadata as object | null),
				...result.metadata,
			} as Prisma.InputJsonValue,
			group_id: group.id,
		},
	});

	try {
		await hooks.telemetry?.({
			kind: 'crash',
			id,
			platform: report.platform,
			revision: report.revision,
			signature,
			reportType: report.report_type,
			comment: report.comment,
		});
	} catch (err) {
		console.warn('[telemetry] pack sink failed', err);
	}
}

/** Re-run symbolication for recent unresolved reports (after a symbol upload). */
export async function reprocessUnsymbolicated(limit = 200): Promise<number> {
	const rows = await prisma.crashReport.findMany({
		where: { status: { in: ['unsymbolicated', 'failed'] } },
		orderBy: { created_at: 'desc' },
		select: { id: true },
		take: limit,
	});
	for (const r of rows) enqueueReport(r.id);
	return rows.length;
}
