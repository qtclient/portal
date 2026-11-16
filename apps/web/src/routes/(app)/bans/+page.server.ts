import { listAccountBans } from '#lib/server/bans.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) => {
	const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
	const { bans, hasNext } = await listAccountBans(page);

	return {
		title: 'Bans',
		bans,
		page,
		hasNext,
	};
}) satisfies PageServerLoad;
