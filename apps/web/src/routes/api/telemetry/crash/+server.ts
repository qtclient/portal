/** /play (browser/WASM) crash reports; same ingest as crashreceiver.php. */
import { ingestCrash } from '#lib/server/telemetry/ingest.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = (event) => {
	let ip: string | null = null;
	try {
		ip = event.getClientAddress();
	} catch {
		/* adapter without client address */
	}
	return ingestCrash({
		request: event.request,
		ip,
		accountId: event.locals.session?.accountId ?? null,
	});
};
