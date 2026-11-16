import { redirect } from '@sveltejs/kit';

import { prisma } from '#lib/server/prisma.js';

import type { PageServerLoad } from './$types';

/**
 * CIP legal links (client translations): `support/?subtopic=legaldocuments&page=`
 * agreement | privacy | rules, plus the older `subtopic=tibiarules`. Each maps to
 * the static page with that slug once an admin publishes it.
 */
const LEGAL_PAGES = new Set(['agreement', 'privacy', 'rules']);

export const load = (async ({ url }) => {
	const subtopic = url.searchParams.get('subtopic') || 'faq';
	const legal =
		subtopic === 'tibiarules'
			? 'rules'
			: subtopic === 'legaldocuments'
				? (url.searchParams.get('page') ?? '')
				: '';
	if (LEGAL_PAGES.has(legal)) {
		const page = await prisma.staticPage.findUnique({
			where: { slug: legal },
			select: { slug: true, hide: true },
		});
		if (page && !page.hide) redirect(302, `/pages/${page.slug}`);
	}
	return { title: 'Support', subtopic, legal };
}) satisfies PageServerLoad;
