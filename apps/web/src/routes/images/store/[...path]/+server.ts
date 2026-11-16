import { error, redirect } from '@sveltejs/kit';

import { runtimeAssetBase } from '#lib/server/runtimeEnv.js';

import type { RequestHandler } from './$types';

/**
 * Store icons live on the tip CDN (`images/store/`, published with the
 * qtclient assets). Redirect there; never bounce to a same-origin `/cdn`
 * path (404 → red DynamicallyLoadedImage placeholders in the client).
 */
export const GET: RequestHandler = async ({ params }) => {
	const rel = params.path || '';
	const tip = runtimeAssetBase()?.replace(/\/+$/, '');
	if (!tip) error(404, `No asset base configured for store image: ${rel}`);
	redirect(302, `${tip}/images/store/${rel}`, { external: true });
};
