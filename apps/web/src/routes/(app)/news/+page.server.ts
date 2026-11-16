import type { PageServerLoad } from './$types';

export const load = (({ url }) => ({
	title: 'News',
	subtopic: url.searchParams.get('subtopic') || 'latestnews',
})) satisfies PageServerLoad;
