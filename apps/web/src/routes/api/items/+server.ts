import { error } from '@sveltejs/kit';
import fs from 'fs';
import path from 'path';

import { CdnSlice } from '#lib/server/cdnSlice.js';
import { itemImagesUrl } from '#lib/server/imageSources.js';

import type { RequestHandler } from './$types';

const itemsImagesPath = './items/';
const itemsFileFormats = ['.gif', '.png'] as const;
const NAMES_FILE = 'names.json';

/**
 * Item sprites + names come from the qtclient asset contract: CDN
 * `assets/items/<rev>/<client id>.png` and `names.json` (`{ "<id>": "name" }`),
 * rendered and published by qtclient (`make -C apps/qtclient publish-assets`).
 * Without a qtclient tip, QTCAAC_ITEM_IMAGES_URL points at any image host.
 */
const slice = new CdnSlice('items', itemsImagesPath);

async function ensureFile(key: string, file: string): Promise<void> {
	await slice.ensure(key, path.join(itemsImagesPath, file), async (root) => {
		const res = await slice.fetch(`${root}${file}`);
		if (!res) return false;
		fs.mkdirSync(itemsImagesPath, { recursive: true });
		fs.writeFileSync(path.join(itemsImagesPath, file), Buffer.from(await res.arrayBuffer()));
		return true;
	});
}

let names: { mtime: number; map: Record<string, string> } | null = null;

async function itemName(itemId: string): Promise<string> {
	await ensureFile(NAMES_FILE, NAMES_FILE);
	const file = path.join(itemsImagesPath, NAMES_FILE);
	try {
		const mtime = fs.statSync(file).mtimeMs;
		if (!names || names.mtime !== mtime) {
			names = { mtime, map: JSON.parse(fs.readFileSync(file, 'utf8')) };
		}
		return names.map[itemId] ?? '';
	} catch {
		return '';
	}
}

export const GET = (async ({ url, request }) => {
	const headers = {
		'Cache-Control': `max-age=${60 * 60 * 24 * 365}`,
		Expires: new Date(Date.now() + 60 * 60 * 24 * 365 * 1000).toUTCString(),
		'Last-Modified': new Date(1337).toUTCString(),
	};

	if (url.host) {
		const ifModifiedSince = request.headers.get('if-modified-since');
		if (ifModifiedSince) {
			return new Response(null, {
				status: 304,
				headers,
			});
		}
	}

	const itemId = url.searchParams.get('id') || '';
	if (!/^\d+$/.test(itemId)) {
		error(400, 'id is required');
	}

	const external = itemImagesUrl(itemId);
	if (external) {
		return Response.json({ src: external, alt: await itemName(itemId) }, { headers });
	}

	await ensureFile(itemId, `${itemId}.png`);

	let itemDataPath = '';
	let mime = 'image/gif';
	for (const ext of itemsFileFormats) {
		const candidate = path.join(itemsImagesPath, itemId + ext);
		if (fs.existsSync(candidate)) {
			itemDataPath = candidate;
			mime = ext === '.png' ? 'image/png' : 'image/gif';
			break;
		}
	}

	if (!itemDataPath) {
		error(404, `Item not found: ${itemId}`);
	}

	const rawData = fs.readFileSync(itemDataPath, 'base64');
	return Response.json(
		{ src: `data:${mime};base64,${rawData}`, alt: await itemName(itemId) },
		{ headers },
	);
}) satisfies RequestHandler;
