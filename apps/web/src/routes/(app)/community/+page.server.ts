import type { PageServerLoad } from './$types';

export const load = (({ url }) => ({
	title: 'Community',
	subtopic: url.searchParams.get('subtopic') || '',
})) satisfies PageServerLoad;
