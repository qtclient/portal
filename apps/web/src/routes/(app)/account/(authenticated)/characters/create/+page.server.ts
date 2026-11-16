import { fail } from '@sveltejs/kit';
import { redirect } from 'sveltekit-flash-message/server';
import invariant from 'tiny-invariant';

import {
	parsePlayerPronoun,
	parsePlayerSex,
	PlayerVocation,
} from '#lib/players.js';
import { generateCharacterInput } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import {
	characterNameValidator,
	presenceValidator,
	stringValidator,
	validate,
} from '#lib/server/validations.js';

import type { Actions } from './$types';

export const actions = {
	default: async (event) => {
		const { request, locals } = event;
		requireLogin(locals);

		const data = await request.formData();
		const characterName = data.get('characterName');
		const characterSex = data.get('characterSex');
		const characterPronouns = data.get('characterPronouns');
		const tutorial = data.get('tutorial');

		const errors = await validate(
			{
				characterName: [presenceValidator, characterNameValidator],
				characterSex: [presenceValidator, stringValidator],
			},
			data,
		);

		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors: errors });
		}

		invariant(characterName && characterSex, 'Missing required fields');
		invariant(typeof characterName === 'string', 'Name must be a string');
		invariant(typeof characterSex === 'string', 'Sex must be a string');

		const characterSexValue = parsePlayerSex(characterSex);
		const characterPronounsValue = parsePlayerPronoun(characterPronouns);

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

		// Global Newhaven: vocation is chosen in-town, not at create.
		const characterInput = generateCharacterInput({
			name: characterName,
			pronoun: characterPronounsValue,
			sex: characterSexValue,
			tutorial: tutorial === 'on',
			vocation: PlayerVocation.None,
		});
		try {
			await prisma.players.create({
				data: {
					account_id: locals.session?.accountId,
					...characterInput,
				},
			});
		} catch (e) {
			console.error(e);
			return fail(500, {
				errors: {
					global: ['Failed to create character'],
				} as Record<string, string[]>,
			});
		}

		redirect(
			'/account',
			{
				message: `Character ${characterName} created!`,
				type: 'success',
			},
			event,
		);
	},
} satisfies Actions;
