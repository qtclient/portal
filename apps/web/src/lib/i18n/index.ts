import { addMessages, init, register } from 'svelte-i18n';

import { browser } from '$app/env';

import en from './locales/en.json';

const defaultLocale = 'en';

// Synchronous so module-scope $_() calls (e.g. server/skills.ts) can format.
addMessages('en', en);
register('pt', () => import('./locales/pt.json'));

void init({
	fallbackLocale: defaultLocale,
	initialLocale: browser ? window.navigator.language : defaultLocale,
});
