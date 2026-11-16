import type { RequestHandler } from './$types';

/**
 * Removed: play SSO. The tibia client no longer exchanges bootstrap
 * codes; use CIP-shaped `POST /clientservices/loginservice.php` (type=login).
 */
export const POST: RequestHandler = async () =>
	Response.json(
		{
			errorCode: 3,
			errorMessage:
				'Play bootstrap SSO was removed. Use the CIP login mask or POST /clientservices/loginservice.php.',
		},
		{ status: 410 },
	);
