import { bundleUrl, cached, loadCdnJson } from '#lib/server/cdnManifest.js';

export const DESKTOP_PLATFORMS = [
	'windows-x64',
	'linux-x64',
	'macos-arm64',
] as const;

export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

/** Schema 1 published zips; schema 2 publishes installers (exe / dmg / appimage). */
export type DesktopFormat = 'zip' | 'exe' | 'dmg' | 'appimage';

export type DesktopAsset = {
	url: string;
	size: number;
	sha256: string;
	file?: string;
	format?: DesktopFormat;
};

/** latest/desktop.json with URLs resolved for the browser. */
export type DesktopManifest = {
	schema: 1 | 2;
	/** `launcher`: the launcher installers (it installs and updates the game). */
	kind?: 'client' | 'launcher';
	revision: string;
	engine?: string;
	productSha?: string;
	publishedAt?: string;
	platforms: Partial<Record<DesktopPlatform, DesktopAsset>>;
};

function isDesktopManifest(v: unknown): v is DesktopManifest {
	const m = v as DesktopManifest | null;
	return (
		!!m &&
		(m.schema === 1 || m.schema === 2) &&
		typeof m.revision === 'string' &&
		typeof m.platforms === 'object' &&
		m.platforms !== null
	);
}

export const loadDesktopManifest = cached<DesktopManifest>(60_000, async () => {
	const raw = await loadCdnJson<unknown>('latest/desktop.json');
	if (!isDesktopManifest(raw)) return null;
	const platforms: DesktopManifest['platforms'] = {};
	for (const p of DESKTOP_PLATFORMS) {
		const asset = raw.platforms[p];
		if (!asset?.url) continue;
		platforms[p] = {
			...asset,
			format: asset.format ?? 'zip',
			url: bundleUrl(asset.url) ?? asset.url,
		};
	}
	return { ...raw, platforms };
});
