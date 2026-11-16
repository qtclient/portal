import { loadOnline } from '#lib/server/community/online.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) =>
	loadOnline(url.searchParams)) satisfies PageServerLoad;
