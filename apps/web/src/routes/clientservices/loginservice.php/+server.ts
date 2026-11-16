/** CIP loginWebService — https://www.tibia.com/clientservices/loginservice.php */
import { handleLoginPost } from '#lib/server/clientservicesPost.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) =>
	handleLoginPost(request);
