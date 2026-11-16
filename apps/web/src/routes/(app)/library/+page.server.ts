import type { PageServerLoad } from './$types';

export const load = (({ url }) => ({
	title: 'Library',
	subtopic: url.searchParams.get('subtopic') || '',
})) satisfies PageServerLoad;
