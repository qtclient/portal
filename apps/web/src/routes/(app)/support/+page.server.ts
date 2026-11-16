import type { PageServerLoad } from './$types';

export const load = (({ url }) => ({
	title: 'Support',
	subtopic: url.searchParams.get('subtopic') || 'faq',
})) satisfies PageServerLoad;
