import * as publicEnv from '$app/env/public';

import { loadReferralDashboard } from '#lib/server/referral.js';
import { requireLogin } from '#lib/server/session.js';

import type { PageServerLoad } from './$types';

const PUBLIC_BASE_URL = publicEnv.PUBLIC_BASE_URL ?? '';

export const load = (async ({ locals }) => {
	requireLogin(locals);
	const dashboard = await loadReferralDashboard(locals.session!.accountId);
	const link = `${PUBLIC_BASE_URL}/account/signup?ref=${locals.session!.accountId}`;
	return {
		title: 'Referral',
		link,
		...dashboard,
	};
}) satisfies PageServerLoad;
