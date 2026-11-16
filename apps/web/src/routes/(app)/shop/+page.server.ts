import { redirect } from '@sveltejs/kit';

import * as publicEnv from '$app/env/public';

import type { PageServerLoad } from './$types';

/** Legacy `/shop` → payments origin. */
export const load = (() => {
	const payments = (publicEnv.PUBLIC_PAYMENTS_URL || '').replace(/\/+$/, '');
	redirect(302, payments || '/account/login', { external: true });
}) satisfies PageServerLoad;
