import { defineConfig } from '#lib/pack-api.js';

export default defineConfig({
	site: {
		logo: '/pack/brand/logo.svg',
		favicon: '/pack/brand/logo.svg',
		tagline: 'Example server built on qtc-aac.',
	},
	client: {
		name: 'Example',
		org: 'Example',
		packId: 'example',
	},
});
