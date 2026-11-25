import { createHash, randomBytes } from 'crypto';

import { building } from '$app/env';

import { prisma } from '#lib/server/prisma.js';

/** The client hands it to its host right after login. */
export const SWITCH_CODE_TTL_MS = 2 * 60_000;

type CodePurpose = 'switch';

export function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

async function issueCode(
	accountId: number,
	purpose: CodePurpose,
	ttlMs: number,
): Promise<string> {
	const code = randomBytes(32).toString('base64url');
	await prisma.bootstrapCodes.create({
		data: {
			code_hash: sha256Hex(code),
			account_id: accountId,
			expires: Date.now() + ttlMs,
			purpose,
		},
	});
	return code;
}

async function consumeCode(
	code: string,
	purpose: CodePurpose,
): Promise<number | null> {
	const code_hash = sha256Hex(code);
	const entry = await prisma.bootstrapCodes.findUnique({
		where: { code_hash },
	});
	if (!entry || entry.purpose !== purpose) return null;
	// Only the request whose delete removes the row may use the code.
	const { count } = await prisma.bootstrapCodes.deleteMany({
		where: { code_hash, purpose },
	});
	if (count !== 1 || Number(entry.expires) <= Date.now()) return null;
	return entry.account_id;
}

/**
 * One-time code from a credential-verified qtclient login, so the website or
 * launcher session can move to the account the player picked in the client.
 */
export function issueSwitchCode(accountId: number): Promise<string> {
	return issueCode(accountId, 'switch', SWITCH_CODE_TTL_MS);
}

export function consumeSwitchCode(code: string): Promise<number | null> {
	return consumeCode(code, 'switch');
}

async function clean() {
	try {
		await prisma.bootstrapCodes.deleteMany({
			where: { expires: { lt: Date.now() } },
		});
	} catch (err) {
		console.error('[playBootstrap] clean failed:', err);
	}
}

if (!building) {
	setInterval(() => void clean(), 15 * 60_000);
}
