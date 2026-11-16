import type { AccountInfo } from '#lib/accounts.js';
import { dbToPlayer, PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { maybeGrantReferralReward } from '#lib/server/referral.js';
import { requireLogin } from '#lib/server/session.js';

import type { LayoutServerLoad } from './$types';

export const load = (async ({ locals }) => {
	requireLogin(locals);
	await maybeGrantReferralReward(locals.session!.accountId);
	const account = await prisma.accounts.findUniqueOrThrow({
		where: {
			id: locals.session?.accountId,
		},
		select: {
			email: true,
			creation: true,
			lastday: true,
			coins: true,
			coins_transferable: true,
			is_verified: true,
			token_secret: true,
			players: {
				select: { ...PlayerSelectForList, charbazaar: true, lastlogin: true },
			},
			emailVerifications: {
				select: { new_email: true },
				orderBy: { created_at: 'desc' },
			},
		},
	});

	const characters = account.players.map((p) => ({
		...dbToPlayer(p),
		charbazaar: Boolean(p.charbazaar),
	}));
	const now = Math.trunc(Date.now() / 1000);
	const accountInfo: AccountInfo = {
		email: account.email,
		createdAt: new Date(account.creation * 1000),
		coins: account.coins,
		coinsTransferable: account.coins_transferable,
		premiumDays:
			account.lastday > now
				? Math.trunc((account.lastday - now) / (24 * 60 * 60))
				: 0,
		isVerified: account.is_verified,
		newEmail: account.emailVerifications[0]?.new_email ?? undefined,
		is2faEnabled: Boolean(account.token_secret),
		lastLogin: new Date(
			characters.reduce(
				(acc, cur) => Math.max(acc, cur.lastLogin?.getTime() ?? 0),
				0,
			),
		),
	};
	return {
		title: 'Account Management',
		characters,
		account: accountInfo,
	};
}) satisfies LayoutServerLoad;
