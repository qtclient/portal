import { CharBazaarStatus } from '@prisma/client';

import {
	auctionPlayerSelect,
	settleExpiredAuctions,
} from '#lib/server/bazaar.js';
import { prisma } from '#lib/server/prisma.js';

import type { PageServerLoad } from './$types';

export const load = (async () => {
	await settleExpiredAuctions();
	const auctions = await prisma.charBazaarAuction.findMany({
		where: {
			status: { in: [CharBazaarStatus.SOLD, CharBazaarStatus.EXPIRED] },
		},
		include: { player: { select: auctionPlayerSelect } },
		orderBy: { ends_at: 'desc' },
		take: 100,
	});
	return {
		title: 'Past auctions',
		auctions: auctions.map((a) => ({
			id: a.id,
			status: a.status,
			currentPrice: a.current_price,
			endsAt: a.ends_at,
			player: a.player,
		})),
	};
}) satisfies PageServerLoad;
