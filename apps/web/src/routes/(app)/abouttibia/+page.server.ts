import type { PageServerLoad } from './$types';

export const load = (({ url }) => ({
	title: 'About',
	subtopic: url.searchParams.get('subtopic') || 'gamefeatures',
})) satisfies PageServerLoad;
