/** Char Bazaar, referral and PIX settings (env-driven). */

function envBool(name: string, fallback: boolean): boolean {
	const raw = process.env[name];
	if (raw == null || raw === '') return fallback;
	return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function envInt(name: string, fallback: number): number {
	const n = Number(process.env[name] ?? fallback);
	return Number.isFinite(n) ? Math.trunc(n) : fallback;
}


export function bazaarCreateFee(): number {
	return Math.max(0, envInt('BAZAAR_CREATE_FEE_COINS', 50));
}

export function bazaarBidFee(): number {
	return Math.max(0, envInt('BAZAAR_BID_FEE_COINS', 50));
}

export function bazaarTaxPercent(): number {
	return Math.min(100, Math.max(0, envInt('BAZAAR_TAX_PERCENT', 12)));
}

export function bazaarMinDays(): number {
	return Math.max(1, envInt('BAZAAR_MIN_DAYS', 1));
}

export function bazaarMaxDays(): number {
	return Math.max(bazaarMinDays(), envInt('BAZAAR_MAX_DAYS', 28));
}

export function bazaarMinStartPrice(): number {
	return Math.max(1, envInt('BAZAAR_MIN_START_PRICE', 50));
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
