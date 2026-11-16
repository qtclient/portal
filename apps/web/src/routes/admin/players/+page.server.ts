import { prisma } from '#lib/server/prisma.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) {
		return { q, players: [] };
	}

	const players = await prisma.players.findMany({
		where: {
			name: { contains: q },
			deletion: 0,
		},
		select: {
			id: true,
			name: true,
			level: true,
			vocation: true,
			group_id: true,
			account: { select: { email: true } },
		},
		orderBy: { name: 'asc' },
		take: 50,
	});

	return { q, players };
}) satisfies PageServerLoad;
