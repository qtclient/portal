import { CharBazaarStatus } from '@prisma/client';

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
	const auctions = await prisma.charBazaarAuction.findMany({
		where: { seller_account_id: locals.session!.accountId },
		include: { player: { select: auctionPlayerSelect } },
		orderBy: { listed_at: 'desc' },
		take: 50,
	});
	return {
		title: 'My auctions',
		auctions: auctions.map((a) => ({
			id: a.id,
			status: a.status,
			currentPrice: a.current_price,
			endsAt: a.ends_at,
			player: a.player,
			active: a.status === CharBazaarStatus.LISTED,
		})),
	};
}) satisfies PageServerLoad;
