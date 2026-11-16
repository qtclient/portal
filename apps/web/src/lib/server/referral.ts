import {
	referralMinLevel,
	referralRewardCoins,
} from '#lib/server/featureFlags.js';
import { prisma } from '#lib/server/prisma.js';

const COIN_TYPE_TRANSFERABLE = 2;

/**
 * If this account was referred and any character reached the level gate,
 * pay both accounts once (idempotent via referral_rewarded_at).
 */
export async function maybeGrantReferralReward(
	accountId: number,
): Promise<boolean> {
	const reward = referralRewardCoins();
	const minLevel = referralMinLevel();
	if (reward <= 0) {
		return false;
	}

	const account = await prisma.accounts.findUnique({
		where: { id: accountId },
		select: {
			id: true,
			referred_by: true,
			referral_rewarded_at: true,
			players: { select: { level: true }, orderBy: { level: 'desc' }, take: 1 },
		},
	});
	if (!account?.referred_by || account.referral_rewarded_at) {
		return false;
	}
	const topLevel = account.players[0]?.level ?? 0;
	if (topLevel < minLevel) {
		return false;
	}

	try {
		await prisma.$transaction(async (tx) => {
			const fresh = await tx.accounts.findUnique({
				where: { id: accountId },
				select: {
					referred_by: true,
					referral_rewarded_at: true,
					coins_transferable: true,
				},
			});
			if (!fresh?.referred_by || fresh.referral_rewarded_at) {
				return;
			}
			const referrer = await tx.accounts.findUnique({
				where: { id: fresh.referred_by },
				select: { id: true, coins_transferable: true },
			});
			if (!referrer) {
				await tx.accounts.update({
					where: { id: accountId },
					data: { referral_rewarded_at: new Date() },
				});
				return;
			}

			await tx.accounts.update({
				where: { id: accountId },
				data: {
					coins_transferable: fresh.coins_transferable + reward,
					referral_rewarded_at: new Date(),
				},
			});
			await tx.accounts.update({
				where: { id: referrer.id },
				data: {
					coins_transferable: referrer.coins_transferable + reward,
				},
			});
			await tx.coinsTransactions.createMany({
				data: [
					{
						account_id: accountId,
						type: 1,
						amount: reward,
						description: `Referral reward (reached level ${minLevel})`,
						coin_type: COIN_TYPE_TRANSFERABLE,
					},
					{
						account_id: referrer.id,
						type: 1,
						amount: reward,
						description: `Referral reward (invitee account ${accountId})`,
						coin_type: COIN_TYPE_TRANSFERABLE,
					},
				],
			});
		});
		return true;
	} catch (e) {
		console.error('[referral] grant failed', e);
		return false;
	}
}

export async function resolveReferrerId(
	refRaw: string | number | null | undefined,
): Promise<number | null> {
	const id = Number(refRaw);
	if (!Number.isFinite(id) || id <= 0) {
		return null;
	}
	const exists = await prisma.accounts.findUnique({
		where: { id: Math.trunc(id) },
		select: { id: true },
	});
	return exists?.id ?? null;
}

export async function loadReferralDashboard(accountId: number) {
	await maybeGrantReferralReward(accountId);

	const invitees = await prisma.accounts.findMany({
		where: { referred_by: accountId },
		select: {
			id: true,
			email: true,
			referral_rewarded_at: true,
			creation: true,
			players: {
				select: { level: true, name: true },
				orderBy: { level: 'desc' },
				take: 1,
			},
		},
		orderBy: { creation: 'desc' },
		take: 50,
	});

	return {
		minLevel: referralMinLevel(),
		reward: referralRewardCoins(),
		invitees: invitees.map((a) => ({
			id: a.id,
			emailMasked: maskEmail(a.email),
			rewarded: Boolean(a.referral_rewarded_at),
			topLevel: a.players[0]?.level ?? 0,
			topName: a.players[0]?.name ?? null,
			createdAt: a.creation,
		})),
	};
}

function maskEmail(email: string): string {
	const [user, domain] = email.split('@');
	if (!domain) return '***';
	const u = user.length <= 2 ? '*' : `${user[0]}***${user[user.length - 1]}`;
	return `${u}@${domain}`;
}
