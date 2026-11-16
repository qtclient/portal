import { fail, redirect } from '@sveltejs/kit';
import invariant from 'tiny-invariant';

import { CIP_NEWS_CATEGORIES } from '#lib/server/otcStatus.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';
import { stringValidator, validate } from '#lib/server/validations.js';

import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const news = await prisma.news.findFirst({
		where: { id: params.id },
	});
	return { news };
}) satisfies PageServerLoad;

export const actions = {
	default: async ({ locals, request, params }) => {
		requireLogin(locals, 'admin');

		const data = await request.formData();
		const method = data.get('_method');
		if (method === 'DELETE') {
			await prisma.news.delete({ where: { id: params.id } });
			redirect(302, '/admin/news');
		}

		const title = data.get('title');
		const content = data.get('content');
		const category = data.get('category');
		const published = data.get('published');
		const ticker = data.get('ticker');

		const errors = await validate(
			{
				title: [stringValidator],
				content: [stringValidator],
				category: [stringValidator],
			},
			data,
		);

		if (Object.keys(errors).length > 0) {
			return fail(400, { invalid: true, errors: errors });
		}

		if (title) {
			invariant(typeof title === 'string', 'Name must be a string');
		}
		if (content) {
			invariant(typeof content === 'string', 'Name must be a string');
		}
		let categoryNorm: string | undefined;
		if (typeof category === 'string' && category) {
			categoryNorm = category.trim().toUpperCase();
			if (!(CIP_NEWS_CATEGORIES as readonly string[]).includes(categoryNorm)) {
				return fail(400, {
					invalid: true,
					errors: {
						category: ['Category must be a Compendium tab'],
					} as Record<string, string[]>,
				});
			}
		}

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
			await prisma.news.update({
				where: { id: params.id },
				data: {
					...(title ? { title } : {}),
					...(content ? { content } : {}),
					...(categoryNorm ? { category: categoryNorm } : {}),
					published: published === 'on',
					ticker: ticker === 'on',
				},
			});
		} catch (e) {
			console.error(e);
			return fail(500, {
				errors: { global: ['Failed to update news article'] } as Record<
					string,
					string[]
				>,
			});
		}

		redirect(302, '/admin/news');
	},
} satisfies Actions;
