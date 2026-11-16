import { getHouseByNameOrId } from '#lib/server/houses.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const house = await getHouseByNameOrId(params.name);
	if (!house) {
		return {
			status: 404,
			error: `House "${params.name}" not found`,
		};
	}

	return {
		title: house.name,
		house,
	};
}) satisfies PageServerLoad;
