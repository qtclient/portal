import { error } from '@sveltejs/kit';

import { prisma } from '#lib/server/prisma.js';
import { enqueueReport } from '#lib/server/telemetry/process.js';

import type { Actions, PageServerLoad } from './$types';

export const load = (async ({ params }) => {
	const group = await prisma.crashGroup.findUnique({
		where: { id: params.id },
		include: {
			reports: {
				orderBy: { created_at: 'desc' },
				take: 50,
				select: {
					id: true,
					created_at: true,
					platform: true,
					revision: true,
					report_type: true,
					comment: true,
					status: true,
					crash_type: true,
					account_id: true,
					frames: true,
				},
			},
		},
	});
	if (!group) error(404, 'Crash group not found');
	return { title: group.title, group };
}) satisfies PageServerLoad;

export const actions = {
	resolve: async ({ params, request }) => {
		const data = await request.formData();
		await prisma.crashGroup.update({
			where: { id: params.id },
			data: {
				resolved: data.get('resolved') === 'true',
				note: String(data.get('note') ?? '').slice(0, 4000) || null,
			},
		});
		return { ok: true };
	},
	reprocess: async ({ params }) => {
		const reports = await prisma.crashReport.findMany({
			where: { group_id: params.id },
			select: { id: true },
			take: 200,
		});
		for (const r of reports) enqueueReport(r.id);
		return { requeued: reports.length };
	},
} satisfies Actions;
