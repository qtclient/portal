import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import invariant from 'tiny-invariant';

import {
	auctionPlayerSelect,
	placeBid,
	settleExpiredAuctions,
} from '#lib/server/bazaar.js';
import { bazaarBidFee } from '#lib/server/featureFlags.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';

import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params, locals }) => {
	await settleExpiredAuctions();
	const auction = await prisma.charBazaarAuction.findUnique({
		where: { id: params.id },
		include: {
			player: { select: auctionPlayerSelect },
			bids: {
				orderBy: { created_at: 'desc' },
				take: 20,
				select: { amount: true, fee: true, created_at: true },
			},
		},
	});
	if (!auction) {
		return { title: 'Auction', auction: null };
	}

	return {
		title: `Auction — ${auction.player.name}`,
		isLoggedIn: Boolean(locals.session),
		isSeller: locals.session?.accountId === auction.seller_account_id,
		isHighBidder:
			locals.session?.accountId === auction.current_bidder_account_id,
		auction: {
			id: auction.id,
			status: auction.status,
			startPrice: auction.start_price,
			currentPrice: auction.current_price,
			hasBidder: auction.current_bidder_account_id != null,
			endsAt: auction.ends_at,
			listedAt: auction.listed_at,
			createFee: auction.create_fee,
			bidFee: auction.bid_fee ?? bazaarBidFee(),
			taxPercent: auction.tax_percent,
			player: auction.player,
			bids: auction.bids,
		},
	};
}) satisfies PageServerLoad;

export const actions = {
	bid: async (event) => {
		const { locals, request, params } = event;
		requireLogin(locals);
		invariant(locals.session, 'session');

		const data = await request.formData();
		const bidRaw = data.get('bid');
		const bid = Number(bidRaw);
		if (!Number.isFinite(bid) || bid <= 0) {
			return fail(400, { error: 'Invalid bid amount' });
		}

		const result = await placeBid({
			accountId: locals.session.accountId,
			auctionId: params.id,
			bid: Math.trunc(bid),
		});
		if (!result.ok) {
			return fail(400, { error: result.error.message });
		}
		redirect(
			`/bazaar/${params.id}`,
			{ type: 'success', message: 'Bid placed.' },
			event,
		);
	},
} satisfies Actions;
