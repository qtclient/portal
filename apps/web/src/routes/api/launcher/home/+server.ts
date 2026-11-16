import * as publicEnv from '$app/env/public';

import { outfitURL } from '#lib/players.js';
import { loadLatestNews } from '#lib/server/community/news.js';
import { prisma } from '#lib/server/prisma.js';
import { serverStatus } from '#lib/server/serverStatus.js';

import type { RequestHandler } from './$types';

const EXCERPT_LENGTH = 280;

/** Rough Markdoc → plain text for the launcher news cards. */
function excerpt(content: string): string {
	const text = content
		.replace(/\{%[^%]*%\}/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[#>*_`~|-]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return text.length > EXCERPT_LENGTH
		? `${text.slice(0, EXCERPT_LENGTH - 1).trimEnd()}…`
		: text;
}

type BoostedRow = {
	boostname: string | null;
	looktype: number;
	lookhead: number;
	lookbody: number;
	looklegs: number;
	lookfeet: number;
	lookaddons: number;
};

function card(row: BoostedRow | null) {
	if (!row || row.looktype <= 0) return null;
	return {
		name: row.boostname ?? '',
		image: outfitURL({
			looktype: row.looktype,
			lookhead: row.lookhead,
			lookbody: row.lookbody,
			looklegs: row.looklegs,
			lookfeet: row.lookfeet,
			lookaddons: row.lookaddons,
			resize: true,
		}),
	};
}

async function boosted() {
	const [creature, boss] = await Promise.all([
		prisma.boostedCreature.findFirst().catch(() => null),
		prisma.boostedBoss.findFirst().catch(() => null),
	]);
	return { creature: card(creature), boss: card(boss) };
}

/**
 * Launcher home screen in one request. Paths are portal-relative; the
 * launcher resolves them against its portal origin.
 */
export const GET: RequestHandler = async () => {
	const [status, news, boost] = await Promise.all([
		serverStatus(),
		loadLatestNews(),
		boosted(),
	]);
	return Response.json(
		{
			server: {
				online: status.serverOnline,
				players: status.onlinePlayerCount,
			},
			tickers: news.tickers.map((t) => ({
				id: t.id,
				text: excerpt(t.content),
				date: t.created_at,
			})),
			news: news.articles.map((a) => ({
				id: a.id,
				title: a.title,
				excerpt: excerpt(a.content),
				author: a.author.name,
				date: a.created_at,
				url: `/news/${a.id}`,
			})),
			boosted: boost,
			links: {
				site: '/',
				account: '/account',
				signup: '/account/signup',
				lostAccount: '/account/lost',
				download: '/download',
				discord: publicEnv.PUBLIC_DISCORD_URL || null,
			},
		},
		{ headers: { 'Cache-Control': 'public, max-age=30' } },
	);
};
