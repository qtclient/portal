import {
	auctionPlayerSelect,
	settleExpiredAuctions,
} from '#lib/server/bazaar.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	requireLogin(locals);
	await settleExpiredAuctions();
	const bids = await prisma.charBazaarBid.findMany({
		where: { account_id: locals.session!.accountId },
		include: {
			auction: {
				include: { player: { select: auctionPlayerSelect } },
			},
		},
		orderBy: { created_at: 'desc' },
		take: 50,
	});
	return {
		title: 'My bids',
		bids: bids.map((b) => ({
			id: b.id,
			amount: b.amount,
			fee: b.fee,
			createdAt: b.created_at,
			auctionId: b.auction_id,
			auctionStatus: b.auction.status,
			isHighBidder:
				b.auction.current_bidder_account_id === locals.session!.accountId,
			player: b.auction.player,
		})),
	};
}) satisfies PageServerLoad;
