import { type Actions, fail, redirect } from '@sveltejs/kit';
import invariant from 'tiny-invariant';

import { CIP_NEWS_CATEGORIES } from '#lib/server/otcStatus.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import {
	presenceValidator,
	stringValidator,
	validate,
} from '#lib/server/validations.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ locals }) => {
	requireLogin(locals, 'admin');

	const author = await prisma.players.findFirst({
		where: {
			account_id: locals.session?.accountId,
			is_main: true,
		},
		select: {
			name: true,
		},
	});

	return { author };
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ locals, request }) => {
		requireLogin(locals, 'admin');

		const data = await request.formData();
		const title = data.get('title');
		const content = data.get('content');
		const category = data.get('category');
		const published = data.get('published');
		const ticker = data.get('ticker');

		const errors = await validate(
			{
				title: [presenceValidator, stringValidator],
				content: [presenceValidator, stringValidator],
				category: [presenceValidator, stringValidator],
			},
			data,
		);

		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors: errors });
		}

		invariant(title && content && category, 'Missing required fields');
		invariant(typeof title === 'string', 'Name must be a string');
		invariant(typeof content === 'string', 'Name must be a string');
		invariant(typeof category === 'string', 'Category must be a string');
		if (
			!(CIP_NEWS_CATEGORIES as readonly string[]).includes(
				category.trim().toUpperCase(),
			)
		) {
			return fail(400, {
				invalid: true,
				errors: {
					category: ['Category must be a Compendium tab'],
				} as Record<string, string[]>,
			});
		}
		const categoryNorm = category.trim().toUpperCase();

		const author = await prisma.players.findFirst({
			where: {
				account_id: locals.session?.accountId,
				is_main: true,
			},
		});

		if (!author) {
			return fail(400, {
				invalid: true,
				errors: { global: ['No main character found'] } as Record<
					string,
					string[]
				>,
			});
		}

		try {
			await prisma.news.create({
				data: {
					title,
					content,
					category: categoryNorm,
					published: published === 'on',
					ticker: ticker === 'on',
					author_id: author.id,
				},
			});
		} catch (e) {
			console.error(e);
			return fail(500, {
				errors: { global: ['Failed to create news article'] } as Record<
					string,
					string[]
				>,
			});
		}

		redirect(302, '/admin/news');
	},
} satisfies Actions;
