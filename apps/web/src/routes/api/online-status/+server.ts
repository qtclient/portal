import { serverStatus } from '#lib/server/serverStatus.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () =>
	Response.json(await serverStatus());
