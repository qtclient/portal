import { error, fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import invariant from 'tiny-invariant';

import { parsePlayerSex, PlayerSex } from '#lib/players.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import { presenceValidator, validate } from '#lib/server/validations.js';

import type { Actions, PageServerLoad } from './$types';

function changeSexPrice(): number {
	return Number(process.env.CHARACTER_CHANGE_SEX_PRICE_COINS ?? 0);
}

export const load = (async ({ params, locals }) => {
	requireLogin(locals);
	const price = changeSexPrice();
	if (price <= 0) {
		return { enabled: false, price: 0, player: null };
	}

	const player = await prisma.players.findFirst({
		where: {
			name: params.name,
			account_id: locals.session?.accountId,
			deletion: 0,
		},
		select: { name: true, sex: true, online: { select: { player_id: true } } },
	});

	if (!player) {
		error(404, 'Character not found');
	}

	return {
		enabled: true,
		price,
		player: {
			name: player.name,
			sex: player.sex,
			online: Boolean(player.online),
		},
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const { request, locals, params } = event;
		requireLogin(locals);

		const price = changeSexPrice();
		if (price <= 0) {
			return fail(400, { errors: { global: ['Sex change is disabled'] } });
		}

		const data = await request.formData();
		const sexValue = data.get('sex');
		const errors = await validate({ sex: [presenceValidator] }, data);
		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors });
		}
		invariant(typeof sexValue === 'string', 'Sex must be a string');
		const sex = parsePlayerSex(sexValue);

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
		if (player.sex === sex) {
			return fail(400, {
				errors: { global: ['Character already has this sex'] },
			});
		}

		const account = await prisma.accounts.findUniqueOrThrow({
			where: { id: locals.session?.accountId },
			select: { coins_transferable: true },
		});
		if (account.coins_transferable < price) {
			return fail(400, {
				errors: {
					global: [`You need ${price} transferable coins to change sex`],
				},
			});
		}

		const looktype =
			sex === PlayerSex.Male
				? 128
				: sex === PlayerSex.Female
					? 136
					: player.looktype;

		await prisma.$transaction([
			prisma.accounts.update({
				where: { id: locals.session?.accountId },
				data: { coins_transferable: { decrement: price } },
			}),
			prisma.players.update({
				where: { id: player.id },
				data: { sex, looktype },
			}),
		]);

		redirect(
			'/account',
			{ message: `Sex changed for ${player.name}`, type: 'success' },
			event,
		);
	},
} satisfies Actions;
