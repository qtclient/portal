import { CharBazaarStatus, type Prisma } from '@prisma/client';

import { PlayerGroup } from '#lib/players.js';
import {
	bazaarBidFee,
	bazaarCreateFee,
	bazaarMaxDays,
	bazaarMinDays,
	bazaarMinStartPrice,
	bazaarTaxPercent,
} from '#lib/server/featureFlags.js';
import { prisma } from '#lib/server/prisma.js';

const COIN_TYPE_TRANSFERABLE = 2;

export type BazaarError = { code: string; message: string };

class BazaarException extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
	}
	toError(): BazaarError {
		return { code: this.code, message: this.message };
	}
}

function fail(code: string, message: string): BazaarException {
	return new BazaarException(code, message);
}

async function recordCoinTx(
	tx: Prisma.TransactionClient,
	accountId: number,
	amount: number,
	description: string,
	type: number,
) {
	await tx.coinsTransactions.create({
		data: {
			account_id: accountId,
			type,
			amount,
			description,
			coin_type: COIN_TYPE_TRANSFERABLE,
		},
	});
}

/** Settle all LISTED auctions whose ends_at has passed. Idempotent. */
export async function settleExpiredAuctions(): Promise<number> {
	const now = new Date();
	const expired = await prisma.charBazaarAuction.findMany({
		where: {
			status: CharBazaarStatus.LISTED,
			ends_at: { lte: now },
		},
		select: { id: true },
		take: 50,
	});
	let settled = 0;
	for (const row of expired) {
		const result = await settleAuctionById(row.id);
		if (result.ok) {
			settled += 1;
		}
	}
	return settled;
}

export async function settleAuctionById(
	auctionId: string,
): Promise<{ ok: true } | { ok: false; error: BazaarError }> {
	try {
		await prisma.$transaction(async (tx) => {
			const auction = await tx.charBazaarAuction.findUnique({
				where: { id: auctionId },
			});
			if (!auction || auction.status !== CharBazaarStatus.LISTED) {
				return;
			}
			if (auction.ends_at.getTime() > Date.now()) {
				return;
			}

			if (
				auction.current_bidder_account_id != null &&
				auction.current_price > 0
			) {
				const tax = Math.floor(
					(auction.current_price * auction.tax_percent) / 100,
				);
				const payout = Math.max(0, auction.current_price - tax);
				const seller = await tx.accounts.findUniqueOrThrow({
					where: { id: auction.seller_account_id },
					select: { coins_transferable: true },
				});
				await tx.accounts.update({
					where: { id: auction.seller_account_id },
					data: { coins_transferable: seller.coins_transferable + payout },
				});
				await recordCoinTx(
					tx,
					auction.seller_account_id,
					payout,
					`Char Bazaar sale payout (auction ${auction.id})`,
					1,
				);
				await tx.players.update({
					where: { id: auction.player_id },
					data: {
						account_id: auction.current_bidder_account_id,
						charbazaar: false,
						is_main: false,
					},
				});
				await tx.charBazaarAuction.update({
					where: { id: auction.id },
					data: {
						status: CharBazaarStatus.SOLD,
						buyer_account_id: auction.current_bidder_account_id,
					},
				});
			} else {
				await tx.players.update({
					where: { id: auction.player_id },
					data: { charbazaar: false },
				});
				await tx.charBazaarAuction.update({
					where: { id: auction.id },
					data: { status: CharBazaarStatus.EXPIRED },
				});
			}
		});
		return { ok: true };
	} catch (e) {
		console.error('[bazaar] settle failed', e);
		return {
			ok: false,
			error: fail('settle_failed', 'Failed to settle auction'),
		};
	}
}

export async function listAuction(input: {
	accountId: number;
	playerId: number;
	startPrice: number;
	days: number;
}): Promise<{ ok: true; id: string } | { ok: false; error: BazaarError }> {

	const createFee = bazaarCreateFee();
	const bidFee = bazaarBidFee();
	const taxPercent = bazaarTaxPercent();
	const minDays = bazaarMinDays();
	const maxDays = bazaarMaxDays();
	const minPrice = bazaarMinStartPrice();

	if (input.days < minDays || input.days > maxDays) {
		return {
			ok: false,
			error: fail(
				'invalid_days',
				`Auction duration must be between ${minDays} and ${maxDays} days`,
			),
		};
	}
	if (input.startPrice < minPrice) {
		return {
			ok: false,
			error: fail('invalid_price', `Minimum start price is ${minPrice} coins`),
		};
	}

	try {
		const id = await prisma.$transaction(async (tx) => {
			const player = await tx.players.findFirst({
				where: {
					id: input.playerId,
					account_id: input.accountId,
					deletion: 0,
				},
				include: {
					online: true,
					owned_guild: { select: { id: true } },
				},
			});
			if (!player) {
				throw fail('not_found', 'Character not found on this account');
			}
			if (player.group_id >= PlayerGroup.Tutor) {
				throw fail('staff', 'Staff characters cannot be listed');
			}
			if (player.online) {
				throw fail('online', 'Character must be offline to list');
			}
			if (player.charbazaar) {
				throw fail('listed', 'Character is already listed');
			}
			if (player.owned_guild) {
				throw fail('guild_owner', 'Guild leaders cannot be listed');
			}

			const account = await tx.accounts.findUniqueOrThrow({
				where: { id: input.accountId },
				select: { coins_transferable: true },
			});
			if (account.coins_transferable < createFee) {
				throw fail('funds', 'Not enough transferable coins for listing fee');
			}

			await tx.accounts.update({
				where: { id: input.accountId },
				data: { coins_transferable: account.coins_transferable - createFee },
			});
			if (createFee > 0) {
				await recordCoinTx(
					tx,
					input.accountId,
					createFee,
					`Char Bazaar listing fee (${player.name})`,
					0,
				);
			}

			const endsAt = new Date(Date.now() + input.days * 24 * 60 * 60 * 1000);
			const auction = await tx.charBazaarAuction.create({
				data: {
					player_id: player.id,
					seller_account_id: input.accountId,
					start_price: input.startPrice,
					current_price: input.startPrice,
					ends_at: endsAt,
					create_fee: createFee,
					bid_fee: bidFee,
					tax_percent: taxPercent,
					status: CharBazaarStatus.LISTED,
				},
			});
			await tx.players.update({
				where: { id: player.id },
				data: { charbazaar: true },
			});
			return auction.id;
		});
		return { ok: true, id };
	} catch (e) {
		if (e instanceof BazaarException) {
			return { ok: false, error: e.toError() };
		}
		console.error('[bazaar] list failed', e);
		return {
			ok: false,
			error: fail('list_failed', 'Failed to create auction').toError(),
		};
	}
}

export async function placeBid(input: {
	accountId: number;
	auctionId: string;
	bid: number;
}): Promise<{ ok: true } | { ok: false; error: BazaarError }> {

	await settleExpiredAuctions();

	try {
		await prisma.$transaction(async (tx) => {
			const auction = await tx.charBazaarAuction.findUnique({
				where: { id: input.auctionId },
			});
			if (!auction || auction.status !== CharBazaarStatus.LISTED) {
				throw fail('not_found', 'Auction not found or already ended');
			}
			if (auction.ends_at.getTime() <= Date.now()) {
				throw fail('ended', 'Auction has ended');
			}
			if (auction.seller_account_id === input.accountId) {
				throw fail('own', 'You cannot bid on your own auction');
			}
			const minBid =
				auction.current_bidder_account_id == null
					? auction.current_price
					: auction.current_price + 1;
			if (input.bid < minBid) {
				throw fail('low_bid', `Bid must be at least ${minBid}`);
			}

			const bidFee = auction.bid_fee;
			const needed = input.bid + bidFee;
			const bidder = await tx.accounts.findUniqueOrThrow({
				where: { id: input.accountId },
				select: { coins_transferable: true },
			});
			if (bidder.coins_transferable < needed) {
				throw fail('funds', 'Not enough transferable coins for bid + fee');
			}

			// Refund previous high bidder escrow (not fee)
			if (
				auction.current_bidder_account_id != null &&
				auction.current_bidder_account_id !== input.accountId
			) {
				const prev = await tx.accounts.findUniqueOrThrow({
					where: { id: auction.current_bidder_account_id },
					select: { coins_transferable: true },
				});
				await tx.accounts.update({
					where: { id: auction.current_bidder_account_id },
					data: {
						coins_transferable: prev.coins_transferable + auction.current_price,
					},
				});
				await recordCoinTx(
					tx,
					auction.current_bidder_account_id,
					auction.current_price,
					`Char Bazaar outbid refund (auction ${auction.id})`,
					1,
				);
			} else if (auction.current_bidder_account_id === input.accountId) {
				// Raising own bid: only charge the delta + fee
				const delta = input.bid - auction.current_price;
				const raiseNeeded = delta + bidFee;
				if (bidder.coins_transferable < raiseNeeded) {
					throw fail('funds', 'Not enough transferable coins to raise bid');
				}
				await tx.accounts.update({
					where: { id: input.accountId },
					data: {
						coins_transferable: bidder.coins_transferable - raiseNeeded,
					},
				});
				await recordCoinTx(
					tx,
					input.accountId,
					delta,
					`Char Bazaar bid raise escrow (auction ${auction.id})`,
					0,
				);
				if (bidFee > 0) {
					await recordCoinTx(
						tx,
						input.accountId,
						bidFee,
						`Char Bazaar bid fee (auction ${auction.id})`,
						0,
					);
				}
				await tx.charBazaarBid.create({
					data: {
						auction_id: auction.id,
						account_id: input.accountId,
						amount: input.bid,
						fee: bidFee,
					},
				});
				await tx.charBazaarAuction.update({
					where: { id: auction.id },
					data: {
						current_price: input.bid,
						current_bidder_account_id: input.accountId,
					},
				});
				return;
			}

			await tx.accounts.update({
				where: { id: input.accountId },
				data: { coins_transferable: bidder.coins_transferable - needed },
			});
			await recordCoinTx(
				tx,
				input.accountId,
				input.bid,
				`Char Bazaar bid escrow (auction ${auction.id})`,
				0,
			);
			if (bidFee > 0) {
				await recordCoinTx(
					tx,
					input.accountId,
					bidFee,
					`Char Bazaar bid fee (auction ${auction.id})`,
					0,
				);
			}

			await tx.charBazaarBid.create({
				data: {
					auction_id: auction.id,
					account_id: input.accountId,
					amount: input.bid,
					fee: bidFee,
				},
			});
			await tx.charBazaarAuction.update({
				where: { id: auction.id },
				data: {
					current_price: input.bid,
					current_bidder_account_id: input.accountId,
				},
			});
		});
		return { ok: true };
	} catch (e) {
		if (e instanceof BazaarException) {
			return { ok: false, error: e.toError() };
		}
		console.error('[bazaar] bid failed', e);
		return {
			ok: false,
			error: fail('bid_failed', 'Failed to place bid').toError(),
		};
	}
}

export const auctionPlayerSelect = {
	id: true,
	name: true,
	level: true,
	vocation: true,
	sex: true,
	looktype: true,
	lookaddons: true,
	lookhead: true,
	lookbody: true,
	looklegs: true,
	lookfeet: true,
} as const;
