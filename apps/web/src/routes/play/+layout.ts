import '#lib/i18n/index.js';

import { locale } from 'svelte-i18n';

import { browser } from '$app/env';

import type { LayoutLoad } from './$types';

/**
 * Do not await waitLocale() — it blocked first paint behind catalogue JSON while
 * the user stared at a black /play stage. Locale is best-effort for any stray
 * strings; the CIP launcher UI does not need i18n to boot.
 */
export const load = (async () => {
	if (browser) {
		void locale.set(window.navigator.language);
	}
	return {};
}) satisfies LayoutLoad;
