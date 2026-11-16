import { prisma } from '#lib/server/prisma.js';

import type { PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const article = await prisma.news.findFirst({
		where: { id: params.id, published: true },
		include: {
			author: { select: { name: true } },
		},
	});

	if (!article) {
		return {
			status: 404,
			error: 'News article not found',
		};
	}

	return {
		title: article.title,
		article,
	};
}) satisfies PageServerLoad;
