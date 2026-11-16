import { isCommunityPanelId } from '#lib/community/panels.js';
import { loadHighscores } from '#lib/server/community/highscores.js';
import { loadOnline } from '#lib/server/community/online.js';
import { listRecentDeaths } from '#lib/server/deaths.js';
import { serializeForJson } from '#lib/server/serializeForJson.js';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const panel = url.searchParams.get('panel');
	if (!panel || !isCommunityPanelId(panel)) {
		return Response.json({ error: 'Unknown community panel' }, { status: 400 });
	}

	let payload: unknown;

	switch (panel) {
		case 'highscores':
			payload = await loadHighscores(url.searchParams);
			break;
		case 'last-kills':
			payload = {
				title: 'Last kills',
				deaths: await listRecentDeaths(50),
			};
			break;
		case 'characters':
			payload = { title: 'Characters' };
			break;
		case 'online':
			payload = await loadOnline(url.searchParams);
			break;
		default:
			return Response.json(
				{ error: 'Unknown community panel' },
				{ status: 400 },
			);
	}

	return Response.json(serializeForJson(payload));
};
