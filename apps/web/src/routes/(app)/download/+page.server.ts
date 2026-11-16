import {
	DESKTOP_PLATFORMS,
	loadDesktopManifest,
} from '#lib/server/desktopReleases.js';

import type { PageServerLoad } from './$types';

const PLATFORM_LABELS: Record<
	(typeof DESKTOP_PLATFORMS)[number],
	{ name: string; arch: string }
> = {
	'windows-x64': { name: 'Windows', arch: '64-bit' },
	'linux-x64': { name: 'Linux', arch: 'x86-64' },
	'macos-arm64': { name: 'macOS', arch: 'Apple Silicon' },
};

export const load = (async ({ setHeaders }) => {
	const manifest = await loadDesktopManifest();
	setHeaders({ 'cache-control': 'public, max-age=60' });

	return {
		title: 'Download',
		revision: manifest?.revision ?? null,
		publishedAt: manifest?.publishedAt ?? null,
		platforms: DESKTOP_PLATFORMS.map((id) => {
			const asset = manifest?.platforms[id];
			return {
				id,
				...PLATFORM_LABELS[id],
				url: asset?.url ?? null,
				file: asset?.file ?? null,
				format: asset?.format ?? null,
				size: asset?.size ?? null,
				sha256: asset?.sha256 ?? null,
			};
		}),
	};
}) satisfies PageServerLoad;
