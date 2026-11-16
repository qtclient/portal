import type { Accounts } from '@prisma/client';

import { prisma } from '#lib/server/prisma.js';
import { check2faToken, comparePassword } from '#lib/server/utils.js';
import {
	numberValidator,
	presenceValidator,
	stringValidator,
	validate,
} from '#lib/server/validations.js';
import { $_ } from '#lib/utils.js';

export type CredentialsBody = {
	email?: unknown;
	password?: unknown;
	token?: unknown;
};

export type CredentialsResult =
	{ ok: true; account: Accounts } | { ok: false; response: Response };

/**
 * Email + password (+ TOTP or backup code when 2FA is on). The failure
 * responses are the JSON shapes the website login popover and launcher expect.
 */
export async function verifyCredentials(
	body: CredentialsBody,
): Promise<CredentialsResult> {
	const formData = new FormData();
	for (const key of ['email', 'password', 'token'] as const) {
		const value = body[key];
		if (typeof value === 'string' && value) formData.set(key, value);
	}

	const errors = await validate(
		{
			email: [presenceValidator, stringValidator],
			password: [presenceValidator, stringValidator],
			token: [numberValidator],
		},
		formData,
	);
	if (Object.keys(errors).length > 0) {
		return {
			ok: false,
			response: Response.json({ ok: false, errors }, { status: 400 }),
		};
	}

	const email = String(formData.get('email')).toLowerCase();
	const password = String(formData.get('password'));
	const token = formData.get('token');

	const account = await prisma.accounts.findUnique({ where: { email } });
	if (!account || !comparePassword(password, account.password)) {
		return {
			ok: false,
			response: Response.json(
				{ ok: false, errors: { global: ['Invalid email or password'] } },
				{ status: 400 },
			),
		};
	}

	if (account.token_secret) {
		if (typeof token !== 'string') {
			return { ok: false, response: Response.json({ tokenRequired: true }) };
		}
		if (!(await check2faToken(token, account.id))) {
			return {
				ok: false,
				response: Response.json(
					{
						ok: false,
						tokenRequired: true,
						errors: { token: [$_('invalid-token')] },
					},
					{ status: 400 },
				),
			};
		}
	}

	return { ok: true, account };
}
