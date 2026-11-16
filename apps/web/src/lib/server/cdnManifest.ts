import { runtimeAssetBase } from '#lib/server/runtimeEnv.js';

/**
 * CDN bundle manifests (`latest/*.json`) hold URLs relative to the bundle
 * root so the same bundle can be served by the Coolify image or the local
 * static tip (`QTCAAC_ASSET_BASE`). Always fetched from the tip origin.
 */

async function fetchJson<T>(url: string): Promise<T | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

/**
 * Load `<QTCAAC_ASSET_BASE>/<rel>`. `fresh` bypasses HTTP caches between the
 * portal and the CDN origin.
 */
export async function loadCdnJson<T>(
	rel: string,
	opts: { fresh?: boolean } = {},
): Promise<T | null> {
	const base = runtimeAssetBase();
	if (!base) return null;
	const query = opts.fresh ? `?t=${Date.now()}` : '';
	return fetchJson<T>(`${base}/${rel}${query}`);
}

/**
 * Bundle-relative path → URL the AAC hands out. Absolute and root-relative
 * URLs (legacy manifests) pass through unchanged.
 */
export function bundleUrl(path: string | undefined): string | undefined {
	if (!path) return path;
	if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/')) return path;
	const rel = path.replace(/^\.\//, '');
	const base = runtimeAssetBase();
	return base ? `${base}/${rel}` : undefined;
}

type CacheEntry<T> = { at: number; value: T | null };

/** Short-TTL memo around an async loader. */
export function cached<T>(
	ttlMs: number,
	load: () => Promise<T | null>,
): () => Promise<T | null> {
	let entry: CacheEntry<T> = { at: 0, value: null };
	return async () => {
		const now = Date.now();
		if (entry.value && now - entry.at < ttlMs) return entry.value;
		entry = { at: now, value: await load() };
		return entry.value;
	};
}
