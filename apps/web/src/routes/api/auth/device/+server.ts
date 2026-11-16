import {
	type CredentialsBody,
	verifyCredentials,
} from '#lib/server/credentials.js';
import {
	bearerToken,
	createDeviceSession,
	deleteDeviceSession,
	deviceName,
	getDeviceSession,
} from '#lib/server/deviceSessions.js';
import { consumeSwitchCode } from '#lib/server/playBootstrap.js';
import { prisma } from '#lib/server/prisma.js';

import type { RequestHandler } from './$types';

function unauthorized() {
	return Response.json(
		{ ok: false, errors: { global: ['Device session expired or revoked.'] } },
		{ status: 401 },
	);
}

async function switchAccount(
	code: unknown,
): Promise<{ id: number; email: string } | null> {
	const accountId =
		typeof code === 'string' && code ? await consumeSwitchCode(code) : null;
	if (!accountId) return null;
	return prisma.accounts.findUnique({
		where: { id: accountId },
		select: { id: true, email: true },
	});
}

/**
 * Launcher login → long-lived device token, from either:
 * - email + password (+ 2FA); same failure shapes as /api/account/web-login, or
 * - `code`: legacy one-time switch code (CIP loginservice.php no longer issues these;
 *   website/device auth stays on web-login / device token).
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => ({}))) as CredentialsBody & {
		code?: unknown;
		deviceName?: unknown;
	};

	let account: { id: number; email: string } | null;
	if (body.code !== undefined) {
		account = await switchAccount(body.code);
		if (!account) {
			return Response.json(
				{ ok: false, errors: { global: ['Account switch code expired.'] } },
				{ status: 401 },
			);
		}
	} else {
		const result = await verifyCredentials(body);
		if (!result.ok) return result.response;
		account = result.account;
	}

	const { id, token } = await createDeviceSession(
		account.id,
		deviceName(body.deviceName),
	);
	return Response.json({
		ok: true,
		email: account.email,
		deviceId: id,
		token,
	});
};

/** Who owns this device token (launcher start-up check). */
export const GET: RequestHandler = async ({ request }) => {
	const token = bearerToken(request);
	const session = token ? await getDeviceSession(token) : null;
	if (!session) return unauthorized();
	return Response.json({
		ok: true,
		email: session.email,
		deviceId: session.id,
		name: session.name,
	});
};

/** Launcher log out. */
export const DELETE: RequestHandler = async ({ request }) => {
	const token = bearerToken(request);
	if (!token || !(await deleteDeviceSession(token))) return unauthorized();
	return Response.json({ ok: true });
};
