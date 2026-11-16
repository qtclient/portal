import { error, fail } from '@sveltejs/kit';
import { toDataURL } from 'qrcode';
import invariant from 'tiny-invariant';

import * as publicEnv from '$app/env/public';

import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import { checkTotp, newTotpSecret, totpURI } from '#lib/server/totp.js';
import { comparePassword } from '#lib/server/utils.js';
import {
	numberValidator,
	presenceValidator,
	stringValidator,
	validate,
} from '#lib/server/validations.js';
import { $_, chunkString } from '#lib/utils.js';

import type { Actions, PageServerLoad } from './$types';

const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';

export const load = (async ({ locals }) => {
	invariant(locals.session?.email, 'Missing email in session');
	const accountId = locals.session?.accountId;
	invariant(accountId, 'accountId must be set');
	const account = await prisma.accounts.findUniqueOrThrow({
		where: { id: accountId },
	});
	if (!account.is_verified) {
		error(403, 'Account is not verified');
	}
	if (account.token_secret) {
		return { enabled: true };
	}

	const secret = newTotpSecret();
	const otpauth = totpURI(locals.session?.email, PUBLIC_TITLE, secret);

	let qrCodeURL = '';
	try {
		qrCodeURL = await toDataURL(otpauth);
	} catch {
		error(500, 'Failed to generate QR code');
	}

	return { secret, qrCodeURL };
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const { request, locals } = event;
		requireLogin(locals);
		const accountId = locals.session?.accountId;
		invariant(accountId, 'accountId must be set');

		const data = await request.formData();
		const password = data.get('password');
		const secret = data.get('secret');
		const token = data.get('token');

		const errors = await validate(
			{
				password: [presenceValidator, stringValidator],
				secret: [presenceValidator, stringValidator],
				token: [presenceValidator, numberValidator],
			},
			data,
		);

		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors: errors });
		}

		invariant(password && secret && token, 'Missing required fields');
		invariant(typeof password === 'string', 'Password must be a string');
		invariant(typeof secret === 'string', 'Secret must be a string');
		invariant(typeof token === 'string', 'Token must be a string');

		const account = await prisma.accounts.findFirst({
			where: {
				id: locals.session?.accountId,
			},
		});
		if (!account || !comparePassword(password, account.password)) {
			return fail(400, {
				errors: {
					password: [$_('invalid-password')],
				} as Record<string, string[]>,
			});
		}

		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors: errors });
		}

		if (!checkTotp(token, secret)) {
			return fail(400, {
				errors: {
					token: [$_('invalid-token')],
				} as Record<string, string[]>,
			});
		}

		const recoveryCodes = chunkString(
			crypto.randomUUID().replaceAll('-', ''),
			5,
		);

		await prisma.accounts.update({
			where: { id: accountId },
			data: {
				token_secret: secret,
				backupCodes: {
					deleteMany: { account_id: accountId },
					createMany: {
						data: recoveryCodes.map((code) => ({ code })),
					},
				},
			},
		});

		return {
			success: true,
			recoveryCodes,
		};
	},
} satisfies Actions;
