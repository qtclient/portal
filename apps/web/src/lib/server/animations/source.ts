import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { outfitImagesPath } from '#lib/server/animations/config.js';
import { CdnSlice } from '#lib/server/cdnSlice.js';

/** Outfit frames: `make extract` (tools/extract/outfits.py) → CDN `assets/outfits/`. */
const slice = new CdnSlice('outfits', outfitImagesPath);
const FILE_RE = /^\d+\/[\w-]+\.png$/;

/** Make `outfits_anim/<looktype>/` available locally (no-op without a CDN base). */
export async function ensureOutfit(looktype: number): Promise<void> {
	if (!Number.isInteger(looktype) || looktype <= 0) return;
	const dataPath = path.join(
		outfitImagesPath,
		looktype.toString(),
		'outfit.data.json',
	);
	await slice.ensure(looktype.toString(), dataPath, async (root) => {
		const res = await slice.fetch(`${root}${looktype}/outfit.data.json`);
		if (!res) return false;
		const raw = await res.text();
		const { files } = JSON.parse(raw) as { files: string[] };
		await slice.download(
			root,
			files.filter((f) => FILE_RE.test(f) && f.startsWith(`${looktype}/`)),
		);
		// Written last: its presence marks the looktype complete.
		mkdirSync(path.dirname(dataPath), { recursive: true });
		writeFileSync(dataPath, raw);
		return true;
	});
}
