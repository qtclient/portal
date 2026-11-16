import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { prisma } from '#lib/server/prisma.js';
import { retentionDays, telemetryDir } from '#lib/server/telemetry/config.js';

const SIX_HOURS = 6 * 60 * 60 * 1000;
let started = false;

/** The stored minidump and, for CIP reports, the session dump beside it. */
function removeReportFiles(report: { dump_path: string | null; metadata: unknown }): void {
	if (report.dump_path) rmSync(join(telemetryDir(), report.dump_path), { force: true });
	const sessiondump = (report.metadata as Record<string, unknown> | null)?.sessiondump_path;
	if (typeof sessiondump === 'string') rmSync(join(telemetryDir(), sessiondump), { force: true });
}

/** Delete telemetry older than QTCAAC_TELEMETRY_RETENTION_DAYS (dumps included). */
export async function purgeExpiredTelemetry(): Promise<void> {
	const cutoff = new Date(Date.now() - retentionDays() * 24 * 60 * 60 * 1000);
	for (;;) {
		const old = await prisma.crashReport.findMany({
			where: { created_at: { lt: cutoff } },
			select: { id: true, dump_path: true, group_id: true, metadata: true },
			take: 500,
		});
		if (old.length === 0) break;
		for (const r of old) removeReportFiles(r);
		await prisma.crashReport.deleteMany({ where: { id: { in: old.map((r) => r.id) } } });
	}
	await prisma.crashGroup.deleteMany({ where: { reports: { none: {} }, last_seen: { lt: cutoff } } });
	await prisma.fpsSample.deleteMany({ where: { created_at: { lt: cutoff } } });
	await prisma.systemSurvey.deleteMany({ where: { created_at: { lt: cutoff } } });
}

/** Delete everything linked to an account (account deletion / privacy request). */
export async function purgeAccountTelemetry(accountId: number): Promise<void> {
	const rows = await prisma.crashReport.findMany({
		where: { account_id: accountId },
		select: { id: true, dump_path: true, metadata: true },
	});
	for (const r of rows) removeReportFiles(r);
	await prisma.crashReport.deleteMany({ where: { account_id: accountId } });
}

export function startTelemetryRetention(): void {
	if (started || process.env.NODE_ENV === 'test') return;
	started = true;
	const run = () =>
		purgeExpiredTelemetry().catch((err) => console.warn('[telemetry] retention failed', err));
	setTimeout(run, 60_000).unref?.();
	setInterval(run, SIX_HOURS).unref?.();
}
