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
			status: CharBazaarStatus.LISTED,
			ends_at: { gt: new Date() },
		},
		include: { player: { select: auctionPlayerSelect } },
		orderBy: { ends_at: 'asc' },
		take: 100,
	});
	return {
		title: 'Char Bazaar',
		auctions: auctions.map((a) => ({
			id: a.id,
			currentPrice: a.current_price,
			startPrice: a.start_price,
			endsAt: a.ends_at,
			hasBidder: a.current_bidder_account_id != null,
			player: a.player,
		})),
	};
}) satisfies PageServerLoad;
