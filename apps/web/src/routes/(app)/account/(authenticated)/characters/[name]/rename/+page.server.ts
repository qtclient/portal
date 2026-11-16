import { error, fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import invariant from 'tiny-invariant';

import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import {
	characterNameValidator,
	presenceValidator,
	validate,
} from '#lib/server/validations.js';

import type { Actions, PageServerLoad } from './$types';

function renamePrice(): number {
	return Number(process.env.CHARACTER_RENAME_PRICE_COINS ?? 0);
}

export const load = (async ({ params, locals }) => {
	requireLogin(locals);
	const price = renamePrice();
	if (price <= 0) {
		return { enabled: false, price: 0, player: null };
	}

	const player = await prisma.players.findFirst({
		where: {
			name: params.name,
			account_id: locals.session?.accountId,
			deletion: 0,
		},
		select: { name: true, online: { select: { player_id: true } } },
	});

	if (!player) {
		error(404, 'Character not found');
	}

	return {
		enabled: true,
		price,
		player: {
			name: player.name,
			online: Boolean(player.online),
		},
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const { request, locals, params } = event;
		requireLogin(locals);

		const price = renamePrice();
		if (price <= 0) {
			return fail(400, { errors: { global: ['Rename is disabled'] } });
		}

		const data = await request.formData();
		const newName = data.get('newName');
		const errors = await validate(
			{ newName: [presenceValidator, characterNameValidator] },
			data,
		);
		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors });
		}
		invariant(typeof newName === 'string', 'Name must be a string');

		const player = await prisma.players.findFirst({
			where: {
				name: params.name,
				account_id: locals.session?.accountId,
				deletion: 0,
			},
			include: { online: true },
		});
		if (!player) {
			return fail(404, { errors: { global: ['Character not found'] } });
		}
		if (player.online) {
			return fail(400, { errors: { global: ['Character must be offline'] } });
		}

		const account = await prisma.accounts.findUniqueOrThrow({
			where: { id: locals.session?.accountId },
			select: { coins_transferable: true },
		});
		if (account.coins_transferable < price) {
			return fail(400, {
				errors: {
					global: [
						`You need ${price} transferable coins to rename this character`,
					],
				},
			});
		}

		const existing = await prisma.players.findFirst({
			where: { name: newName },
		});
		if (existing) {
			return fail(400, { errors: { newName: ['Name is already taken'] } });
		}

		await prisma.$transaction([
			prisma.accounts.update({
				where: { id: locals.session?.accountId },
				data: { coins_transferable: { decrement: price } },
			}),
			prisma.players.update({
				where: { id: player.id },
				data: { name: newName },
			}),
		]);

		redirect(
			'/account',
			{ message: `Character renamed to ${newName}`, type: 'success' },
			event,
		);
	},
} satisfies Actions;
