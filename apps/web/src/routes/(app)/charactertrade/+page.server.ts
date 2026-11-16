import type { PageServerLoad } from './$types';

export const load = (({ url }) => ({
	title: 'Character Trade',
	subtopic: url.searchParams.get('subtopic') || '',
})) satisfies PageServerLoad;
