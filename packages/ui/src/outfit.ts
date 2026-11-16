/** One decoded frame of an `/api/outfits` animation. */
export type OutfitFrame = { image: HTMLImageElement; duration: number };

/** `fetch` or a drop-in replacement (the launcher passes the Tauri HTTP plugin's). */
export type FetchLike = (
	input: string,
	init?: RequestInit,
) => Promise<Response>;

async function decode(src: string): Promise<HTMLImageElement> {
	const image = new Image();
	image.src = src;
	await image.decode();
	return image;
}

/** Fetch `/api/outfits` JSON (`{frames: [{image: dataUrl, duration}]}`) and decode every frame. */
export async function loadOutfitFrames(
	url: string,
	fetchFn: FetchLike = fetch,
): Promise<OutfitFrame[]> {
	const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const data = (await res.json()) as {
		frames?: { image: string; duration: number }[];
	};
	return Promise.all(
		(data.frames ?? []).map(async (f) => ({
			duration: f.duration,
			image: await decode(f.image),
		})),
	);
}
