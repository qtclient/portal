import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import invariant from 'tiny-invariant';

import { PlayerGroup } from '#lib/players.js';
import { listAuction } from '#lib/server/bazaar.js';
import {
	bazaarCreateFee,
	bazaarMaxDays,
	bazaarMinDays,
	bazaarMinStartPrice,
	bazaarTaxPercent,
} from '#lib/server/featureFlags.js';
import { PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';

import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ locals, url }) => {
	requireLogin(locals);

	const step = Math.min(
		4,
		Math.max(1, Number(url.searchParams.get('step')) || 1),
	);
	const playerId = Number(url.searchParams.get('playerId') || 0);
	const startPrice = Number(
		url.searchParams.get('startPrice') || bazaarMinStartPrice(),
	);
	const days = Number(url.searchParams.get('days') || bazaarMinDays());

	const characters = await prisma.players.findMany({
		where: {
			account_id: locals.session!.accountId,
			deletion: 0,
			group_id: { lt: PlayerGroup.Tutor },
			charbazaar: false,
			owned_guild: null,
			online: null,
		},
		select: PlayerSelectForList,
		orderBy: { name: 'asc' },
	});

	const selected =
		playerId > 0 ? (characters.find((c) => c.id === playerId) ?? null) : null;

	return {
		title: 'Create auction',
		step,
		characters,
		selected,
		startPrice: Number.isFinite(startPrice)
			? Math.trunc(startPrice)
			: bazaarMinStartPrice(),
		days: Number.isFinite(days) ? Math.trunc(days) : bazaarMinDays(),
		fees: {
			createFee: bazaarCreateFee(),
			taxPercent: bazaarTaxPercent(),
			minDays: bazaarMinDays(),
			maxDays: bazaarMaxDays(),
			minPrice: bazaarMinStartPrice(),
		},
	};
}) satisfies PageServerLoad;

export const actions = {
	confirm: async (event) => {
		const { locals, request } = event;
		requireLogin(locals);
		invariant(locals.session, 'session');

		const data = await request.formData();
		const playerId = Number(data.get('playerId'));
		const startPrice = Number(data.get('startPrice'));
		const days = Number(data.get('days'));

		if (!Number.isFinite(playerId) || playerId <= 0) {
			return fail(400, { error: 'Select a character' });
		}
		if (!Number.isFinite(startPrice) || !Number.isFinite(days)) {
			return fail(400, { error: 'Invalid price or duration' });
		}

		const result = await listAuction({
			accountId: locals.session.accountId,
			playerId: Math.trunc(playerId),
			startPrice: Math.trunc(startPrice),
			days: Math.trunc(days),
		});
		if (!result.ok) {
			return fail(400, { error: result.error.message });
		}
		redirect(
			`/bazaar/${result.id}`,
			{ type: 'success', message: 'Auction created.' },
			event,
		);
	},
} satisfies Actions;
