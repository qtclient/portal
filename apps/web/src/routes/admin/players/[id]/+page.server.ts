import { fail, redirect } from '@sveltejs/kit';
import invariant from 'tiny-invariant';

import { isPlayerVocation, PlayerGroup } from '#lib/players.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import { characterNameValidator, validate } from '#lib/server/validations.js';

import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const player = await prisma.players.findUnique({
		where: { id: Number(params.id) },
		select: {
			id: true,
			name: true,
			level: true,
			vocation: true,
			group_id: true,
			account: { select: { email: true } },
		},
	});

	if (!player) {
		return { status: 404, error: 'Player not found' };
	}

	return {
		title: `Player ${player.name}`,
		player,
	};
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ request, locals, params }) => {
		requireLogin(locals, 'admin');

		const data = await request.formData();
		const name = data.get('name');
		const level = Number(data.get('level'));
		const vocation = Number(data.get('vocation'));
		const groupId = Number(data.get('group_id'));

		const errors = await validate({ name: [characterNameValidator] }, data);
		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors });
		}
		invariant(typeof name === 'string', 'Name required');
		if (!isPlayerVocation(vocation)) {
			return fail(400, { errors: { global: ['Invalid vocation'] } });
		}
		if (
			groupId < PlayerGroup.Normal ||
			groupId > PlayerGroup.God ||
			!Number.isFinite(groupId)
		) {
			return fail(400, { errors: { global: ['Invalid group'] } });
		}

		const existing = await prisma.players.findFirst({
			where: { name, NOT: { id: Number(params.id) } },
		});
		if (existing) {
			return fail(400, { errors: { name: ['Name already taken'] } });
		}

		await prisma.players.update({
			where: { id: Number(params.id) },
			data: {
				name,
				level: Number.isFinite(level) ? level : 1,
				vocation,
				group_id: groupId,
			},
		});

		redirect(302, '/admin/players');
	},
} satisfies Actions;
