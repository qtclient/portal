/** CIP clientWebService — https://www.tibia.com/clientservices/clientservices.php */
import { handleClientServicesPost } from '#lib/server/clientservicesPost.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) =>
	handleClientServicesPost(request);
