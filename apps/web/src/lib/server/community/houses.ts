import invariant from 'tiny-invariant';

import { listHouses, listTownsForHouses } from '#lib/server/houses.js';

const ORDERS = ['name', 'size', 'rent'] as const;

export async function loadHouses(searchParams: URLSearchParams) {
	const townParam = searchParams.get('town');
	const orderParam = searchParams.get('order') ?? 'name';
	const freeOnly = searchParams.get('state') === 'free';

	const order = ORDERS.includes(orderParam as (typeof ORDERS)[number])
		? (orderParam as (typeof ORDERS)[number])
		: 'name';
	const townId = townParam ? Number(townParam) : undefined;
	invariant(
		townId === undefined || Number.isFinite(townId),
		'Invalid town filter',
	);

	const towns = await listTownsForHouses();
	const houses = await listHouses({
		townId: townId && townId > 0 ? townId : undefined,
		freeOnly,
		order,
	});

	return {
		title: 'Houses',
		towns,
		houses,
		townId: townId ?? 0,
		order,
		freeOnly,
	};
}
