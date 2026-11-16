import { loadNewsArchive } from '#lib/server/community/news.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) =>
	loadNewsArchive(url.searchParams)) satisfies PageServerLoad;
