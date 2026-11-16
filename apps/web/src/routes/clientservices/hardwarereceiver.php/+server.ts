/** CIP `fpsHistoryRecipient`: FPS history (`dataType: FPSHistory`) + system surveys. */
import { ingestHardware } from '#lib/server/telemetry/ingest.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
	let ip: string | null = null;
	try {
		ip = event.getClientAddress();
	} catch {
		/* adapter without client address */
	}
	return ingestHardware({
		request: event.request,
		ip,
		accountId: event.locals.session?.accountId ?? null,
	});
};
