import type { PageServerLoad } from './$types';

export const load = (({ url }) => ({
	title: 'Game Guides',
	subtopic: url.searchParams.get('subtopic') || 'manual',
})) satisfies PageServerLoad;
