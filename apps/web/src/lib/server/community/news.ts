import { prisma } from '#lib/server/prisma.js';

const ARCHIVE_PER_PAGE = 10;

const newsAuthorInclude = {
	author: {
		select: {
			name: true,
		},
	},
} as const;

export async function loadLatestNews() {
	const [tickers, articles] = await Promise.all([
		prisma.news.findMany({
			where: {
				published: true,
				ticker: true,
			},
			include: newsAuthorInclude,
			orderBy: {
				created_at: 'desc',
			},
			take: 10,
		}),
		prisma.news.findMany({
			where: {
				published: true,
				ticker: false,
			},
			include: newsAuthorInclude,
			orderBy: {
				created_at: 'desc',
			},
			take: 5,
		}),
	]);

	return {
		title: 'Latest News',
		tickers,
		articles,
	};
}

export async function loadNewsArchive(searchParams: URLSearchParams) {
	const page = Math.max(1, Number(searchParams.get('page')) || 1);
	const limit = Math.max(
		1,
		Math.min(50, Number(searchParams.get('limit')) || ARCHIVE_PER_PAGE),
	);
	const skip = (page - 1) * limit;

	const [articles, count] = await prisma.$transaction([
		prisma.news.findMany({
			where: { published: true },
			include: {
				author: { select: { name: true } },
			},
			orderBy: { created_at: 'desc' },
			skip,
			take: limit,
		}),
		prisma.news.count({ where: { published: true } }),
	]);

	return {
		title: 'News archive',
		articles,
		page,
		count,
		perPage: limit,
	};
}
