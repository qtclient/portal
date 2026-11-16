/**
 * MyAAC-compatible external image hosts, for servers without a qtclient tip
 * (QTCAAC_ASSET_BASE). Same conventions as MyAAC's `item_images_url` /
 * `outfit_images_url`:
 *
 *   QTCAAC_ITEM_IMAGES_URL=https://item-images.example/1098/   → <url><id><ext>
 *   QTCAAC_ITEM_IMAGES_EXT=.gif
 *   QTCAAC_OUTFIT_IMAGES_URL=https://outfit-images.example/outfit.php
 *     → <url>?id=&addons=&head=&body=&legs=&feet=&mount=&direction=
 *
 * Unset (default): sprites come from the qtclient CDN asset slices.
 */
function env(name: string): string {
	return (process.env[name] ?? '').trim();
}

export function itemImagesUrl(itemId: string): string | null {
	const base = env('QTCAAC_ITEM_IMAGES_URL');
	if (!base) return null;
	const ext = env('QTCAAC_ITEM_IMAGES_EXT') || '.gif';
	return `${base.replace(/\/?$/, '/')}${itemId}${ext}`;
}

export type OutfitLook = {
	looktype: number;
	addons: number;
	head: number;
	body: number;
	legs: number;
	feet: number;
	mount: number;
	direction: number;
};

export function outfitImagesUrl(look: OutfitLook): string | null {
	const base = env('QTCAAC_OUTFIT_IMAGES_URL');
	if (!base) return null;
	const q = new URLSearchParams({
		id: String(look.looktype),
		addons: String(look.addons),
		head: String(look.head),
		body: String(look.body),
		legs: String(look.legs),
		feet: String(look.feet),
		mount: String(look.mount),
		direction: String(look.direction),
	});
	return `${base}${base.includes('?') ? '&' : '?'}${q}`;
}
