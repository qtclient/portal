import { fail } from '@sveltejs/kit';

import {
	listDeviceSessions,
	revokeAllDeviceSessions,
	revokeDeviceSession,
} from '#lib/server/deviceSessions.js';
import { requireLogin } from '#lib/server/session.js';

import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	requireLogin(locals);
	return {
		title: 'Devices',
		devices: await listDeviceSessions(locals.session.accountId),
	};
}) satisfies PageServerLoad;

export const actions = {
	revoke: async ({ request, locals }) => {
		requireLogin(locals);
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string' || !id) return fail(400, { invalid: true });
		await revokeDeviceSession(locals.session.accountId, id);
		return { success: true };
	},
	revokeAll: async ({ locals }) => {
		requireLogin(locals);
		await revokeAllDeviceSessions(locals.session.accountId);
		return { success: true };
	},
} satisfies Actions;
