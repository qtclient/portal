import { loadGuilds } from '#lib/server/community/guilds.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url, locals }) => ({
	...(await loadGuilds(url.searchParams)),
	isLoggedIn: Boolean(locals.session),
})) satisfies PageServerLoad;
