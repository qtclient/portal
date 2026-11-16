import { loadCdnJson } from '#lib/server/cdnManifest.js';
import { runtimePublicBaseUrl } from '#lib/server/runtimeEnv.js';

/** `latest/client-version.json`: the live browser build (WASM engine revision). */
type ClientVersionManifest = {
	revision: string;
	productSha?: string;
	assetsRevision?: string;
};

/**
 * What the live CDN serves. `revision` is `latest/release.json` revision, the
 * value the launcher (desktop) and /play (browser) send as their client
 * revision. `webRevision` is the WASM engine revision an older /play sends.
 */
export type LiveClientRevision = {
	revision: string;
	webRevision: string;
	assetsRevision: string;
};

const TTL_MS = 15_000;
let live: { at: number; value: LiveClientRevision | null } = {
	at: 0,
	value: null,
};

async function fetchLive(fresh: boolean): Promise<LiveClientRevision | null> {
	const [release, web] = await Promise.all([
		loadCdnJson<{ revision?: string }>('latest/release.json', { fresh }),
		loadCdnJson<ClientVersionManifest>('latest/client-version.json', {
			fresh,
		}),
	]);
	const revision = release?.revision?.trim() ?? '';
	const webRevision = web?.revision?.trim() ?? '';
	if (!revision && !webRevision) return null;
	return { revision, webRevision, assetsRevision: web?.assetsRevision ?? '' };
}

/**
 * Live client revision (short TTL cache); null until a client is published.
 * `fresh` refetches and refreshes the cache, so logins follow the release
 * gate as soon as it reopens.
 */
export async function loadLiveClientRevision(
	opts: { fresh?: boolean } = {},
): Promise<LiveClientRevision | null> {
	const now = Date.now();
	if (!opts.fresh && live.value && now - live.at < TTL_MS) return live.value;
	live = { at: now, value: await fetchLive(!!opts.fresh) };
	return live.value;
}

export function clientUpdatePayload(manifest: LiveClientRevision | null) {
	const site = runtimePublicBaseUrl() || '';
	return {
		needUpdate: true as const,
		revision: manifest?.revision || manifest?.webRevision || 'unknown',
		assetsRevision: manifest?.assetsRevision ?? '',
		download: {
			wasm: `${site}/play`,
			desktop: `${site}/download`,
			page: `${site}/download`,
		},
	};
}

/**
 * Client revision from CIP `X-Tibia-Client`, qtclient `x-qtclient-revision`, or the
 * JSON body (`clientRevision` / `revision`).
 */
export function clientRevisionFromRequest(
	request: Request,
	body: { clientRevision?: unknown; revision?: unknown },
): string {
	const header =
		request.headers.get('x-tibia-client')?.trim() ||
		request.headers.get('x-qtclient-revision')?.trim() ||
		'';
	if (header) return header;
	const value = body.clientRevision ?? body.revision;
	return typeof value === 'string' ? value.trim() : '';
}

/**
 * OTC login error for a client that is not the live release (nil when it may
 * log in). Clients that send no revision pass until
 * QTCAAC_REQUIRE_CLIENT_REVISION=1. The client's update prompt matches the
 * "out of date" wording.
 */
export async function outdatedClientError(got: string) {
	const manifest = await loadLiveClientRevision();
	const accepted = [manifest?.revision, manifest?.webRevision].filter(
		(r): r is string => !!r,
	);
	if (accepted.length === 0) return null;
	if (
		got
			? accepted.includes(got)
			: process.env.QTCAAC_REQUIRE_CLIENT_REVISION !== '1'
	) {
		return null;
	}
	return {
		// CIP's "client too old" login error; the Lua client matches the "out of date" text.
		errorCode: 7,
		errorMessage: 'Your client is out of date. Please update and try again.',
		qtclient: clientUpdatePayload(manifest),
	};
}
