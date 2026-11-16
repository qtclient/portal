import { type Actions, redirect } from '@sveltejs/kit';

import { deleteSession } from '#lib/server/session.js';

import type { PageServerLoad } from './$types';

export const load = (() => {
	// we only use this endpoint for the api
	// and don't need to see the page
	redirect(302, '/');
}) satisfies PageServerLoad;

export const actions: Actions = {
	async default({ cookies }) {
		const sid = cookies.get('sid');
		if (sid) {
			cookies.delete('sid', { path: '/' });
			await deleteSession(sid);
		}

		redirect(302, '/');
	},
};
