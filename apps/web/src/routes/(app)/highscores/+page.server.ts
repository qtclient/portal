import { loadHighscores } from '#lib/server/community/highscores.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) =>
	loadHighscores(url.searchParams)) satisfies PageServerLoad;
