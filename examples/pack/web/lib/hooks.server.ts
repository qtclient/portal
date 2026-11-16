import type { PackServerHooks } from '#lib/pack-api.js';

export const hooks: PackServerHooks = {
	// Tag every page response so it is easy to see the pack is active.
	handle: async ({ event, resolve }) => {
		const response = await resolve(event);
		response.headers.set('x-example-pack', '1');
		return response;
	},
	loginResponse: (response) => ({ ...response, motd: 'Welcome to Example!' }),
	telemetry: (event) => {
		if (event.kind === 'crash') console.info('[example] crash', event.signature);
	},
};
