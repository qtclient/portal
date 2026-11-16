/**
 * Char Bazaar (website side: bidding), referral and PIX settings.
 * Listing rules (create fee, duration, start price, tax) are the game server's
 * charBazaar* config: auctions are set up in the client.
 */

function envBool(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (raw == null || raw === '') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function envInt(name: string, fallback: number): number {
	const n = Number(process.env[name] ?? fallback);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export function bazaarBidFee(): number {
	return Math.max(0, envInt('BAZAAR_BID_FEE_COINS', 50));
}

export function referralMinLevel(): number {
	return Math.max(1, envInt('REFERRAL_MIN_LEVEL', 50));
}

export function referralRewardCoins(): number {
	return Math.max(0, envInt('REFERRAL_REWARD_COINS', 5));
}

export function isPixEnabled(): boolean {
	return envBool('ENABLE_PIX', false);
}
