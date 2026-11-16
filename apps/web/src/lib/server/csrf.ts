import type { Handle } from '@sveltejs/kit/hooks';

import { dev } from '$app/env';

/**
 * SvelteKit's origin check, re-implemented so native clients can reach the
 * telemetry ingest endpoints. The Qt client and CI upload multipart bodies
 * without an `Origin` header, which the built-in check rejects. Kit's own
 * check is turned off (`csrf.trustedOrigins: ['*']` in vite.config.ts) and
 * this handle runs first.
 *
 * Exempt paths authenticate differently or carry no cookie-backed privilege:
 * symbol uploads need a bearer token; crash/hardware reports only attach the
 * session's account id as metadata.
 */
const EXEMPT = new Set([
	'/clientservices/crashreceiver.php',
	'/clientservices/hardwarereceiver.php',
	'/api/telemetry/crash',
	'/api/telemetry/symbols',
]);

// Same set as SvelteKit's is_form_content_type (incl. its binary form type).
const FORM_TYPES = [
	'application/x-www-form-urlencoded',
	'multipart/form-data',
	'text/plain',
	'application/x-sveltekit-formdata',
];

function isFormContentType(request: Request): boolean {
	const type =
		request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() ??
		'';
	return FORM_TYPES.includes(type);
}

export const csrfHandle: Handle = async ({ event, resolve }) => {
	const { request, url } = event;
	if (
		!dev &&
		['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
		isFormContentType(request) &&
		request.headers.get('origin') !== url.origin &&
		!EXEMPT.has(url.pathname)
	) {
		const message = `Cross-site ${request.method} form submissions are forbidden`;
		return request.headers.get('accept') === 'application/json'
			? Response.json({ message }, { status: 403 })
			: new Response(message, { status: 403 });
	}
	return resolve(event);
};
