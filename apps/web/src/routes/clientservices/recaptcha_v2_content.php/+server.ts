/** CIP reCAPTCHA v2 content stub (create-account UI may disable captcha). */
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
	new Response('<!DOCTYPE html><html><body></body></html>', {
		headers: { 'content-type': 'text/html; charset=utf-8' },
	});
