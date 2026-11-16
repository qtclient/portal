import { error } from '@sveltejs/kit';

import type { PageLoad } from './$types';

export const load = (({ url }) => {
	error(404, `Page not found: ${url.pathname}`);
}) satisfies PageLoad;
