import { loadFlashMessage } from 'sveltekit-flash-message/server';

import * as privateEnv from '$app/env/private';

import { AccountType } from '#lib/accounts.js';
import { PlayerGroup } from '#lib/players.js';
import { dbToPlayer, PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { parseTimeString } from '#lib/server/utils.js';

import type { LayoutServerLoad } from './$types';

const SERVER_SAVE_TIME = privateEnv.SERVER_SAVE_TIME ?? '';

export const load = loadFlashMessage(async ({ locals }) => {
	const highscores = await prisma.players.findMany({
		where: { group_id: { lt: PlayerGroup.Gamemaster }, deletion: 0 },
		select: PlayerSelectForList,
		orderBy: { experience: 'desc' },
		take: 5,
	});

	const boostedBoss = await prisma.boostedBoss.findFirst();
	const boostedCreature = await prisma.boostedCreature.findFirst();
	const staticPages = await prisma.staticPage.findMany({
		where: { hide: false },
		orderBy: { order: 'asc' },
	});

	const accountCharacters = locals.session?.accountId
		? await prisma.players.findMany({
				where: { account_id: locals.session.accountId },
				select: PlayerSelectForList,
			})
		: null;

	const nextServerSave = parseTimeString(SERVER_SAVE_TIME || '00:00:00');

	return {
		highscores: highscores.map(dbToPlayer),
		boostedBoss,
		boostedCreature,
		isLoggedIn: Boolean(locals.session),
		isAdmin: locals.session?.type === AccountType.God,
		staticPages,
		accountCharacters: accountCharacters?.map(dbToPlayer),
		nextServerSave,
	};
}) satisfies LayoutServerLoad;
