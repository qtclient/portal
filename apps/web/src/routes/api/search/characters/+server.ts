import type { Prisma } from '@prisma/client';

import { dbToPlayer, PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const search = url.searchParams.get('q');
	if (!search) {
		return Response.json({ results: [] });
	}
	const where: Prisma.PlayersWhereInput = {};
	const guild = url.searchParams.get('guild');
	if (guild === '0') {
		where.guild_membership = { is: null };
	} else if (guild === '1') {
		where.guild_membership = { isNot: null };
	}

	const results = (
		await prisma.players.findMany({
			where: {
				name: { contains: search, not: { contains: '~~' } },
				deletion: 0,
				...where,
			},
			select: PlayerSelectForList,
		})
	)
		.map(dbToPlayer)
		.map((player) => ({
			...player,
			balance: player.balance?.toString(),
			experience: player.experience?.toString(),
		}));

	return Response.json({ results });
};
