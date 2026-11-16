import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import invariant from 'tiny-invariant';

import * as privateEnv from '$app/env/private';

import { AccountType } from '#lib/accounts.js';
import {
	parsePlayerPronoun,
	parsePlayerSex,
	PlayerVocation,
} from '#lib/players.js';
import { emailEnabled, sendVerificationEmail } from '#lib/server/email.js';
import { generateCharacterInput } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { resolveReferrerId } from '#lib/server/referral.js';
import { hashPassword } from '#lib/server/utils.js';
import {
	characterNameValidator,
	emailValidator,
	presenceValidator,
	stringValidator,
	validate,
} from '#lib/server/validations.js';

import type { Actions, PageServerLoad } from './$types';

const AUTO_ADMIN_EMAIL = privateEnv.AUTO_ADMIN_EMAIL ?? '';

export const load = (async ({ url }) => {
	const ref = url.searchParams.get('ref');
	return {
		title: 'Create Account',
		ref: ref && /^\d+$/.test(ref) ? ref : '',
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const { request } = event;

		const data = await request.formData();
		let email = data.get('email');
		const password = data.get('password');
		const characterName = data.get('characterName');
		const characterSex = data.get('characterSex');
		const characterPronouns = data.get('characterPronouns');

		const errors = await validate(
			{
				email: [presenceValidator, emailValidator],
				password: [presenceValidator, stringValidator],
				passwordConfirmation: [
					presenceValidator,
					stringValidator,
					(value) => {
						if (value !== password) {
							return 'Passwords do not match';
						}
						return null;
					},
				],
				characterName: [presenceValidator, characterNameValidator],
				characterSex: [presenceValidator, stringValidator],
			},
			data,
		);

		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors: errors });
		}

		invariant(
			email && password && characterName && characterSex,
			'Missing required fields',
		);
		invariant(typeof email === 'string', 'Email must be a string');
		invariant(typeof password === 'string', 'Password must be a string');
		invariant(typeof characterName === 'string', 'Name must be a string');
		invariant(typeof characterSex === 'string', 'Name must be a string');

		const characterSexValue = parsePlayerSex(characterSex);
		const characterPronounsValue = parsePlayerPronoun(characterPronouns);
		const tutorial = data.get('tutorial');

		email = email.toLowerCase();

		const account = await prisma.accounts.findUnique({ where: { email } });
		if (account) {
			return fail(400, {
				errors: {
					email: ['Email is already taken'],
				} as Record<string, string[]>,
			});
		}

		const hashedPassword = hashPassword(password);
		const characterInput = generateCharacterInput({
			name: characterName,
			pronoun: characterPronounsValue,
			sex: characterSexValue,
			tutorial: tutorial === 'on',
			vocation: PlayerVocation.None,
		});

		const existingPlayer = await prisma.players.findFirst({
			where: { name: characterName },
		});
		if (existingPlayer) {
			return fail(400, {
				errors: {
					characterName: ['Character name is already taken'],
				} as Record<string, string[]>,
			});
		}

		const isAdmin = email === AUTO_ADMIN_EMAIL;
		const referredBy = await resolveReferrerId(
			String(data.get('ref') ?? data.get('referredBy') ?? ''),
		);

		const created = await prisma.accounts.create({
			data: {
				email,
				password: hashedPassword,
				creation: Math.trunc(Date.now() / 1000),

				type: isAdmin ? AccountType.God : AccountType.Normal,
				...(referredBy ? { referred_by: referredBy } : {}),

				players: {
					createMany: {
						data: [{ ...characterInput, is_main: true }],
					},
				},

				...(emailEnabled
					? {
							emailVerifications: {
								create: {
									expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
								},
							},
						}
					: { is_verified: true }),
			},
			include: {
				emailVerifications: true,
			},
		});
		if (!created || (emailEnabled && !created.emailVerifications[0])) {
			return fail(400, {
				errors: {
					global: ['Failed to create account'],
				} as Record<string, string[]>,
			});
		}
		const verification = created.emailVerifications[0];
		if (verification) {
			await sendVerificationEmail(created.email, verification.token);
		}
		redirect(
			'/account/login',
			{
				type: 'success',
				message: verification
					? 'Account created. Check your email to confirm your account.'
					: 'Account created. You can log in now.',
			},
			event,
		);
	},
} satisfies Actions;
