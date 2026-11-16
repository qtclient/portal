import { type Actions, fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';

import { ensureGuildWithPermission } from '#lib/server/guilds.js';
import { prisma } from '#lib/server/prisma.js';
import { $_ } from '#lib/utils.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ locals, params }) => {
	await ensureGuildWithPermission({
		locals,
		params,
		minRank: 4,
	});

	return { resigning: true };
}) satisfies PageServerLoad;

export const actions = {
	default: async (event) => {
		const { locals, request, params } = event;
		const guild = await ensureGuildWithPermission({
			locals,
			params,
			minRank: 4,
		});

		const data = await request.formData();
		const playerName = data.get('newOwner');
		if (typeof playerName !== 'string') {
			return fail(400, { errors: { global: [$_('characters-invalid-name')] } });
		}

		await prisma.guilds.update({
			where: { id: guild.id },
			data: { owner: { connect: { name: playerName } } },
		});

		redirect(
			`/guilds/${guild.name}`,
			{
				type: 'success',
				message: $_('guilds-resign-success', { values: { name: playerName } }),
			},
			event,
		);
	},
} satisfies Actions;
