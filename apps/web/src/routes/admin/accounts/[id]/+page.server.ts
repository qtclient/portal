import { fail, redirect } from '@sveltejs/kit';
import invariant from 'tiny-invariant';

import { isAccountType } from '#lib/accounts.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import { hashPassword } from '#lib/server/utils.js';

import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const account = await prisma.accounts.findUnique({
		where: { id: Number(params.id) },
		select: {
			id: true,
			name: true,
			email: true,
			type: true,
			coins: true,
			coins_transferable: true,
			is_verified: true,
			lastday: true,
			premdays: true,
		},
	});

	if (!account) {
		return { status: 404, error: 'Account not found' };
	}

	const now = Math.trunc(Date.now() / 1000);
	return {
		title: `Account ${account.name}`,
		account: {
			...account,
			premiumDays:
				account.lastday > now
					? Math.trunc((account.lastday - now) / (24 * 60 * 60))
					: 0,
		},
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request, locals, params }) => {
		requireLogin(locals, 'admin');

		const data = await request.formData();
		const email = data.get('email');
		const type = Number(data.get('type'));
		const coins = Number(data.get('coins'));
		const coinsTransferable = Number(data.get('coins_transferable'));
		const premiumDays = Number(data.get('premiumDays'));
		const isVerified = data.get('is_verified') === 'on';
		const newPassword = data.get('newPassword');

		invariant(typeof email === 'string', 'Email required');
		if (!isAccountType(type)) {
			return fail(400, { errors: { global: ['Invalid account type'] } });
		}

		const now = Math.trunc(Date.now() / 1000);
		const lastday = premiumDays > 0 ? now + premiumDays * 24 * 60 * 60 : 0;

		await prisma.accounts.update({
			where: { id: Number(params.id) },
			data: {
				email,
				type,
				coins: Number.isFinite(coins) ? coins : 0,
				coins_transferable: Number.isFinite(coinsTransferable)
					? coinsTransferable
					: 0,
				is_verified: isVerified,
				lastday,
				premdays: Number.isFinite(premiumDays) ? premiumDays : 0,
				...(typeof newPassword === 'string' && newPassword.length > 0
					? {
							password: hashPassword(newPassword),
							deviceSessions: { deleteMany: {} },
						}
					: {}),
			},
		});

		redirect(302, '/admin/accounts');
	},
} satisfies Actions;
