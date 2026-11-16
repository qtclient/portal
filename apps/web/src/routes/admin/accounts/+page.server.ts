import { prisma } from '#lib/server/prisma.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ url }) => {
	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) {
		return { q, accounts: [] };
	}

	const accounts = await prisma.accounts.findMany({
		where: {
			OR: [{ email: { contains: q } }, { name: { contains: q } }],
		},
		select: {
			id: true,
			name: true,
			email: true,
			type: true,
			coins: true,
			coins_transferable: true,
			is_verified: true,
		},
		orderBy: { id: 'asc' },
		take: 50,
	});

	return { q, accounts };
}) satisfies PageServerLoad;
