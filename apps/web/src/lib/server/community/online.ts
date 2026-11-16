import invariant from 'tiny-invariant';

import { PlayerGroup } from '#lib/players.js';
import { dbToPlayer, PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { isOrder, isSort } from '#lib/sorting.js';

export async function loadOnline(searchParams: URLSearchParams) {
	const sort = searchParams.get('sort') ?? 'name';
	const order = searchParams.get('order') ?? 'asc';
	invariant(isSort(sort), 'Invalid sort');
	invariant(isOrder(order), 'Invalid order');

	const characters = (
		await prisma.playerOnline.findMany({
			select: {
				player: {
					select: PlayerSelectForList,
				},
			},
			where: { player: { group_id: { lt: PlayerGroup.Gamemaster } } },
			orderBy: { player: { [sort]: order } },
		})
	).map(({ player }) => player);

	return {
		title: "Who's online?",
		characters: characters.map(dbToPlayer),
		sort,
		order,
	};
}
