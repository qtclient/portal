/**
 * /play crash reporting → POST /api/telemetry/crash (JSON). The server
 * symbolicates WASM frames with source maps uploaded for the revision.
 *
 * At most MAX_REPORTS per page load, deduplicated by message + top of stack,
 * sent with `keepalive` so an abort followed by a reload still reports.
 */
const MAX_REPORTS = 3;
const sent = new Set<string>();

export type BrowserCrash = {
	name: string;
	message: string;
	stack?: string | null;
	stage: string;
	revision: string;
	extra?: Record<string, unknown>;
};

export function reportBrowserCrash(crash: BrowserCrash): void {
	try {
		const key = `${crash.name}:${crash.message}:${(crash.stack ?? '').slice(0, 200)}`;
		if (sent.has(key) || sent.size >= MAX_REPORTS) return;
		sent.add(key);
		const body = JSON.stringify({
			name: crash.name.slice(0, 128),
			message: crash.message.slice(0, 2000),
			stack: (crash.stack ?? '').slice(0, 16_000),
			stage: crash.stage,
			revision: crash.revision,
			platform: 'wasm',
			userAgent: navigator.userAgent,
			url: location.pathname,
			extra: crash.extra,
		});
		void fetch('/api/telemetry/crash', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'x-qtclient-revision': crash.revision,
			},
			body,
			keepalive: body.length < 60_000,
			credentials: 'same-origin',
		}).catch(() => {
			/* best effort */
		});
	} catch {
		/* never let reporting break the client */
	}
}
