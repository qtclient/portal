import { listRecentDeaths } from '#lib/server/deaths.js';

import type { PageServerLoad } from './$types';

export const load = (async () => {
	const deaths = await listRecentDeaths(50);

	return {
		title: 'Last kills',
		deaths,
	};
}) satisfies PageServerLoad;
