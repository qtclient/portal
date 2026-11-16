import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, type PluginOption, searchForWorkspaceRoot } from 'vite';

import { playEnginePlugin } from './vite.play-engine.js';

const here = fileURLToPath(new URL('.', import.meta.url));

/**
 * `$pack/<module>` → applied pack (src/lib/pack) or the core default. Types use
 * the same fallback through tsconfig `paths`.
 */
function packAliases(): { find: string; replacement: string }[] {
	return ['config', 'hooks.server', 'play.client'].map((mod) => {
		const fromPack = `${here}src/lib/pack/${mod}.ts`;
		return {
			find: `$pack/${mod}`,
			replacement: existsSync(fromPack)
				? fromPack
				: `${here}src/lib/pack-default/${mod}.ts`,
		};
	});
}

export default defineConfig({
	plugins: [
		playEnginePlugin(),
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			inspector: false,
			adapter: adapter(),
			// Origin checks run in src/lib/server/csrf.ts (telemetry ingest is
			// exempt for native clients that send no Origin header).
			csrf: { trustedOrigins: ['*'] },
		}) as PluginOption,
	],
	server: {
		fs: {
			allow: [searchForWorkspaceRoot(process.cwd())],
		},
	},
	resolve: {
		alias: packAliases(),
		// Extensions from a second @codemirror/state copy are rejected at runtime.
		dedupe: ['@codemirror/state', '@codemirror/view', '@codemirror/language'],
	},
	optimizeDeps: {
		exclude: [
			'@codemirror/lang-markdown',
			'@codemirror/theme-one-dark',
			'svelte',
			'svelte-dnd-action',
		],
		include: [
			'intl-messageformat',
			'@formatjs/icu-messageformat-parser',
			'@formatjs/icu-skeleton-parser',
		],
	},
	ssr: {
		noExternal: [
			// Workspace packages ship TypeScript sources; Node must never load them raw.
			/^@qtc-aac\//,
			'intl-messageformat',
			'@formatjs/icu-messageformat-parser',
			'@formatjs/icu-skeleton-parser',
		],
	},
});
