import type { SKRSContext2D } from '@napi-rs/canvas';
import { error } from '@sveltejs/kit';
import invariant from 'tiny-invariant';

import { outfitImagesPath, walkSpeeds } from '#lib/server/animations/config.js';
import {
	loadData,
	mountLooktype,
	outfit,
} from '#lib/server/animations/outfits.js';
import { ensureOutfit } from '#lib/server/animations/source.js';
import { outfitImagesUrl } from '#lib/server/imageSources.js';

import type { RequestHandler } from './$types';

function parseIntWithDefault(value: unknown, def = 0): number {
	if (!value) return def;

	invariant(
		typeof value === 'string' || typeof value === 'number',
		'value must be a string or number found ' + typeof value + ' instead',
	);
	if (typeof value === 'number') return value;

	return parseInt(value) ?? def;
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

	const looktype = parseIntWithDefault(
		url.searchParams.get('looktype') || url.searchParams.get('id'),
	);
	const external = outfitImagesUrl({
		looktype,
		addons: parseIntWithDefault(url.searchParams.get('lookaddons')),
		head: parseIntWithDefault(url.searchParams.get('lookhead')),
		body: parseIntWithDefault(url.searchParams.get('lookbody')),
		legs: parseIntWithDefault(url.searchParams.get('looklegs')),
		feet: parseIntWithDefault(url.searchParams.get('lookfeet')),
		mount: parseIntWithDefault(url.searchParams.get('mount')),
		direction: parseIntWithDefault(url.searchParams.get('direction'), 3),
	});
	if (external) {
		return Response.json({ frames: [{ image: external, duration: 0 }] });
	}

	await ensureOutfit(looktype);
	let outfitData = loadData(looktype, outfitImagesPath, false);
	if (!outfitData) {
		return Response.json({});
	}
	let mount = parseIntWithDefault(url.searchParams.get('mount'));

	if (mount > 0) {
		await ensureOutfit(mountLooktype(mount));
		const mountOutfitData = loadData(mount, outfitImagesPath, true, outfitData);
		if (mountOutfitData) {
			outfitData = mountOutfitData;
		} else {
			mount = 0;
		}
	}

	if (!outfitData) {
		error(404, 'Outfit not found');
	}

	const head = parseIntWithDefault(url.searchParams.get('lookhead'));
	const body = parseIntWithDefault(url.searchParams.get('lookbody'));
	const legs = parseIntWithDefault(url.searchParams.get('looklegs'));
	const feet = parseIntWithDefault(url.searchParams.get('lookfeet'));
	const addons = parseIntWithDefault(url.searchParams.get('lookaddons'));
	const direction = parseIntWithDefault(url.searchParams.get('direction'), 3);
	const resize = parseIntWithDefault(url.searchParams.get('resize'), 0);

	const frames: SKRSContext2D[] = [];
	const durations: number[] = [];

	const moveAnimFrames: number = outfitData?.framesNumber;

	for (
		let moveAnimFrame = 1;
		moveAnimFrame <= moveAnimFrames;
		++moveAnimFrame
	) {
		const frame = await outfit(
			outfitData,
			outfitImagesPath,
			looktype,
			addons,
			head,
			body,
			legs,
			feet,
			mount,
			direction,
			moveAnimFrame,
			resize === 1,
		);
		if (!frame) {
			error(500, 'Failed to create canvas frame');
		}
		frames.push(frame);
		durations.push(walkSpeeds[moveAnimFrames]);
	}

	return Response.json({
		frames: frames.map((frame, index) => ({
			image: frame.canvas.toDataURL(),
			duration: durations[index],
		})),
	});
}) satisfies RequestHandler;
