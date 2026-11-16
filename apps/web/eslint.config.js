import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { flatConfigs as importX } from 'eslint-plugin-import-x';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

import { loadConfig } from '@sveltejs/load-config';

const svelteConfig = (await loadConfig('./', { traverse: false }))?.config;

export default ts.config(
	{
		ignores: [
			'build/',
			'.svelte-kit/',
			'node_modules/',
			'static/',
			'items/',
			'outfits_anim/',
			'*.cjs',
			'*.config.js',
			'prisma.config.ts',
		],
	},
	js.configs.recommended,
	...ts.configs.recommendedTypeChecked,
	...svelte.configs.base,
	prettierRecommended,
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node },
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.svelte'],
			},
		},
		plugins: {
			'simple-import-sort': simpleImportSort,
			'import-x': importX.recommended.plugins['import-x'],
		},
		rules: {
			'comma-dangle': ['error', 'always-multiline'],
			'simple-import-sort/imports': [
				'error',
				{
					// The default grouping, but with type imports first in each group.
					groups: [
						['^\\u0000'],
						['^node:.*\\u0000$', '^node:'],
						['^@?\\w.*\\u0000$', '^@?\\w'],
						['^\\$app?\\w.*\\u0000$', '^\\$app?\\w'],
						['^[#$]lib?\\w.*\\u0000$', '^[#$]lib?\\w'],
						['^\\$?\\w.*\\u0000$', '^\\$?\\w'],
						['^~?\\w.*\\u0000$', '^~?\\w'],
						['(?<=\\u0000)$', '^'],
						['^\\..*\\u0000$', '^\\.'],
					],
				},
			],
			'simple-import-sort/exports': 'error',
			'import-x/newline-after-import': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_' },
			],
			'@typescript-eslint/no-misused-promises': [
				'error',
				{ checksVoidReturn: false },
			],
			'@typescript-eslint/no-floating-promises': [
				'error',
				{ ignoreVoid: true },
			],
			// Numeric enums mirror Crystal's integer columns and are compared to raw DB/form values.
			'@typescript-eslint/no-unsafe-enum-comparison': 'off',
			// Form and JSON inputs are coerced with String() on purpose.
			'@typescript-eslint/no-base-to-string': 'off',
			'@typescript-eslint/require-await': 'off',
			// Widening assertions in fail() payloads shape the ActionData unions pages read.
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',
			// TypeScript checks undefined identifiers, including ambient types like DndEvent.
			'no-undef': 'off',
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser,
				svelteConfig,
			},
		},
		rules: {
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
		},
	},
);
