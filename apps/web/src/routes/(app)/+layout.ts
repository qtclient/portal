import '#lib/i18n/index.js';

import { locale, waitLocale } from 'svelte-i18n';

import { browser } from '$app/env';

import type { LayoutLoad } from './$types';

export const load = (async ({ data }) => {
	if (browser) {
		await locale.set(window.navigator.language);
	}
	await waitLocale();

	return { ...data };
}) satisfies LayoutLoad;
