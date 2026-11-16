/** CIP `crashReportUrl`: Breakpad minidump + `Comment` / `ReportType` annotations. */
import { ingestCrash } from '#lib/server/telemetry/ingest.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) =>
	ingestCrash({
		request: event.request,
		ip: safeIp(event),
		accountId: event.locals.session?.accountId ?? null,
	});

function safeIp(event: Parameters<RequestHandler>[0]): string | null {
	try {
		return event.getClientAddress();
	} catch {
		return null;
	}
}
