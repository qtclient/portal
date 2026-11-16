/** CIP tutorialProgressWebService — accepted, discarded. */
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async () =>
	new Response(null, { status: 204 });
