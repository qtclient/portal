import { dbToItem } from '#lib/server/items.js';
import {
	dbToPlayer,
	dbToSkills,
	PlayerSelectForList,
} from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { $_ } from '#lib/utils.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const player = await prisma.players.findFirst({
		where: {
			name: params.name,
			deletion: 0,
		},
		select: {
			...PlayerSelectForList,
			balance: true,
			town_id: true,
			lastlogin: true,
			account_id: true,
			settings: true,
			deaths: {
				take: 20,
				orderBy: { time: 'desc' },
			},
		},
	});
	if (!player) {
		return {
			status: 404,
			error: $_('characters-not-found', { values: { name: params.name } }),
		};
	}
	const town =
		(await prisma.towns.findUnique({
			where: { id: player.town_id },
			select: { name: true },
		})) ?? undefined;

	const accountCharacters = player.settings?.hidden
		? []
		: (
				await prisma.players.findMany({
					where: {
						account_id: player.account_id,
						deletion: 0,
						OR: [{ settings: { hidden: false } }, { settings: null }],
					},
					select: { ...PlayerSelectForList },
				})
			).map(dbToPlayer);

	const showSkills = player.settings?.show_skills ?? true;
	const showInventory = player.settings?.show_inventory ?? true;

	const inventory = !showInventory
		? []
		: (
				await prisma.playerItems.findMany({
					where: {
						player_id: player.id,
					},
				})
			).map(dbToItem);

	return {
		character: dbToPlayer({ ...player, town: town }),
		deaths: player.deaths,
		balance: showInventory ? player.balance : null,
		skills: showSkills ? dbToSkills(player) : null,
		inventory: showInventory ? inventory : null,
		accountCharacters,
	};
}) satisfies PageServerLoad;
