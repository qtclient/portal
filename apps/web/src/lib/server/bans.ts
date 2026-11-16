import { prisma } from '#lib/server/prisma.js';
import { parseDate } from '#lib/utils.js';

export type AccountBanEntry = {
	accountId: number;
	accountName: string;
	email: string;
	reason: string;
	bannedAt: Date;
	expiresAt: Date;
	isActive: boolean;
	bannedByName: string;
};

const PER_PAGE = 25;

export async function listAccountBans(page = 1): Promise<{
	bans: AccountBanEntry[];
	page: number;
	hasNext: boolean;
}> {
	const skip = (page - 1) * PER_PAGE;
	const bans = await prisma.accountBans.findMany({
		orderBy: { banned_at: 'desc' },
		skip,
		take: PER_PAGE + 1,
		include: {
			accounts: { select: { name: true, email: true } },
			players: { select: { name: true } },
		},
	});

	const hasNext = bans.length > PER_PAGE;
	const slice = hasNext ? bans.slice(0, PER_PAGE) : bans;
	const now = Date.now();

	return {
		bans: slice.map((ban) => ({
			accountId: ban.account_id,
			accountName: ban.accounts.name,
			email: ban.accounts.email,
			reason: ban.reason,
			bannedAt: parseDate(ban.banned_at),
			expiresAt: parseDate(ban.expires_at),
			isActive: Number(ban.expires_at) * 1000 > now,
			bannedByName: ban.players.name,
		})),
		page,
		hasNext,
	};
}
