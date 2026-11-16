import { loadHouses } from '#lib/server/community/houses.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) =>
	loadHouses(url.searchParams)) satisfies PageServerLoad;
