/** Legacy multiplex — prefer CIP `/clientservices/loginservice.php`. */
import { handleClientServicesMultiplex } from '#lib/server/clientservicesPost.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) =>
	handleClientServicesMultiplex(request);
