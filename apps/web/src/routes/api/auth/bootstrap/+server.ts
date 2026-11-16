import type { RequestHandler } from './$types';

/**
 * Removed: play SSO. CipSoft launcher parity uses CIP login mask /
 * `/clientservices/loginservice.php` only (no one-time bootstrap codes into tibia).
 */
export const POST: RequestHandler = async () =>
	Response.json(
		{
			ok: false,
			errors: {
				global: [
					'Play bootstrap SSO was removed. Sign in with the CIP login mask (email/password → /clientservices/loginservice.php).',
				],
			},
		},
		{ status: 410 },
	);
