import { consumeSwitchCode } from '#lib/server/playBootstrap.js';
import { prisma } from '#lib/server/prisma.js';
import {
	deleteSession,
	isHttpsRequest,
	performLogin,
} from '#lib/server/session.js';

import type { RequestHandler } from './$types';

/**
 * Legacy account-switch endpoint. CIP loginservice.php no longer issues switch
 * codes; website sessions stay on web-login / device token.
 */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => ({}))) as { code?: unknown };
	const accountId =
		typeof body.code === 'string' && body.code
			? await consumeSwitchCode(body.code)
			: null;
	const account = accountId
		? await prisma.accounts.findUnique({
				where: { id: accountId },
				select: { email: true },
			})
		: null;
	if (!account) {
		return Response.json(
			{ ok: false, errors: { global: ['Account switch code expired.'] } },
			{ status: 401 },
		);
	}

	const previous = cookies.get('sid');
	if (previous) await deleteSession(previous);
	await performLogin(cookies, account.email, isHttpsRequest(request, url));
	return Response.json({ ok: true, email: account.email });
};
