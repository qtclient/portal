import { loadLatestNews } from '#lib/server/community/news.js';

import type { PageServerLoad } from './$types';

export const load = (async () => loadLatestNews()) satisfies PageServerLoad;
