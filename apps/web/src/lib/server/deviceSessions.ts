import { randomBytes } from 'crypto';

import { sha256Hex } from '#lib/server/playBootstrap.js';
import { prisma } from '#lib/server/prisma.js';

const TOKEN_PREFIX = 'idt_';
/** Skip the last-used write when the session was touched this recently. */
const TOUCH_INTERVAL_MS = 5 * 60_000;

export type DeviceSession = {
	id: string;
	accountId: number;
	email: string;
	name: string;
};

export function deviceName(raw: unknown): string {
	const name = typeof raw === 'string' ? raw.trim().slice(0, 100) : '';
	return name || 'Launcher';
}

/** Returns the plaintext token; it is never stored or shown again. */
export async function createDeviceSession(
	accountId: number,
	name: string,
): Promise<{ id: string; token: string }> {
	const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
	const session = await prisma.deviceSessions.create({
		data: { token_hash: sha256Hex(token), account_id: accountId, name },
	});
	return { id: session.id, token };
}

export function bearerToken(request: Request): string | null {
	const header = request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(\S+)$/i.exec(header);
	return match?.[1].startsWith(TOKEN_PREFIX) ? match[1] : null;
}

export async function getDeviceSession(
	token: string,
): Promise<DeviceSession | null> {
	const session = await prisma.deviceSessions.findUnique({
		where: { token_hash: sha256Hex(token) },
		include: { account: { select: { email: true } } },
	});
	if (!session) return null;
	if (Date.now() - session.last_used_at.getTime() > TOUCH_INTERVAL_MS) {
		await prisma.deviceSessions.update({
			where: { id: session.id },
			data: { last_used_at: new Date() },
		});
	}
	return {
		id: session.id,
		accountId: session.account_id,
		email: session.account.email,
		name: session.name,
	};
}

export async function deleteDeviceSession(token: string): Promise<boolean> {
	const { count } = await prisma.deviceSessions.deleteMany({
		where: { token_hash: sha256Hex(token) },
	});
	return count > 0;
}

export function listDeviceSessions(accountId: number) {
	return prisma.deviceSessions.findMany({
		where: { account_id: accountId },
		select: { id: true, name: true, created_at: true, last_used_at: true },
		orderBy: { last_used_at: 'desc' },
	});
}

export async function revokeDeviceSession(
	accountId: number,
	id: string,
): Promise<boolean> {
	const { count } = await prisma.deviceSessions.deleteMany({
		where: { id, account_id: accountId },
	});
	return count > 0;
}

export async function revokeAllDeviceSessions(accountId: number) {
	await prisma.deviceSessions.deleteMany({ where: { account_id: accountId } });
}
