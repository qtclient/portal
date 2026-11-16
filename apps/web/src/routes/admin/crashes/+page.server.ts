import { prisma } from '#lib/server/prisma.js';

import type { PageServerLoad } from './$types';

const PAGE = 50;

export const load = (async ({ url }) => {
	const show = url.searchParams.get('show') === 'all' ? 'all' : 'open';
	const platform = url.searchParams.get('platform') ?? '';
	const groups = await prisma.crashGroup.findMany({
		where: {
			...(show === 'open' ? { resolved: false } : {}),
			...(platform ? { platform } : {}),
		},
		orderBy: { last_seen: 'desc' },
		take: PAGE,
	});
	const [pending, failed, total] = await Promise.all([
		prisma.crashReport.count({ where: { status: 'pending' } }),
		prisma.crashReport.count({ where: { status: 'failed' } }),
		prisma.crashReport.count(),
	]);
	return { title: 'Crashes', show, platform, groups, pending, failed, total };
}) satisfies PageServerLoad;
