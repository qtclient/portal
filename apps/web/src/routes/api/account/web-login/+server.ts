import {
	type CredentialsBody,
	verifyCredentials,
} from '#lib/server/credentials.js';
import { isHttpsRequest, performLogin } from '#lib/server/session.js';

import type { RequestHandler } from './$types';

/** Website session cookie only — game client uses CIP loginservice.php. */
export const POST: RequestHandler = async ({ request, cookies, url }) => {
	const body = (await request.json().catch(() => ({}))) as CredentialsBody;
	const result = await verifyCredentials(body);
	if (!result.ok) return result.response;
	const { account } = result;

	await performLogin(cookies, account.email, isHttpsRequest(request, url));

	return Response.json({
		ok: true,
		email: account.email,
	});
};
