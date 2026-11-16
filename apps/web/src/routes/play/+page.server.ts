import { error } from '@sveltejs/kit';

import { runtimeAssetBase } from '#lib/server/runtimeEnv.js';

import type { PageServerLoad } from './$types';

export const load = (({ locals }) => {
	const cdn = runtimeAssetBase();
	if (!cdn) {
		error(
			500,
			'QTCAAC_ASSET_BASE (or QTCLIENT_ASSET_BASE) is required — local tip is http://127.0.0.1:9080 (make infra)',
		);
	}
	return {
		title: 'Play',
		isLoggedIn: Boolean(locals.session),
		accountEmail: locals.session?.email ?? null,
		/**
		 * CIP tip host: QTCAAC_ASSET_BASE → your static CDN (prod) or
		 * http://127.0.0.1:9080 (local nginx from `make infra` + `make cdn`).
		 * Cross-origin WASM works with COEP credentialless on /play (hooks).
		 */
		cdn,
	};
}) satisfies PageServerLoad;
