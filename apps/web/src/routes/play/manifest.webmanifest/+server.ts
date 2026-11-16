import * as publicEnv from '$app/env/public';

import { pack } from '#lib/pack.js';

import type { RequestHandler } from './$types';

const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';

const TITLE = PUBLIC_TITLE || 'qtc-aac';

const MANIFEST = {
	id: '/play',
	name: TITLE,
	short_name: TITLE,
	description: `${TITLE} browser client`,
	start_url: '/play',
	scope: '/play',
	display: 'standalone',
	orientation: 'any',
	background_color: '#0b0e12',
	theme_color: '#0b0e12',
	icons: pack.site.icons.map((icon) => ({
		src: icon.src,
		sizes: icon.sizes,
		purpose: icon.purpose ?? 'any',
	})),
};

export const GET: RequestHandler = async () => {
	return new Response(JSON.stringify(MANIFEST), {
		headers: {
			'Content-Type': 'application/manifest+json; charset=utf-8',
			'Cache-Control': 'public, max-age=3600',
			// Same COI as other /play/* responses (hooks also set these).
			'Cross-Origin-Opener-Policy': 'same-origin',
			'Cross-Origin-Embedder-Policy': 'credentialless',
			'Cross-Origin-Resource-Policy': 'same-origin',
		},
	});
};
