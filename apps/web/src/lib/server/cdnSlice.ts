import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'fs';
import path from 'path';

import { cached, loadCdnJson } from '#lib/server/cdnManifest.js';
import { runtimeAssetBase } from '#lib/server/runtimeEnv.js';

/**
 * Local cache of a CDN `assets/<name>/` slice (rendered by `make extract`,
 * published by `make -C apps/qtclient publish-assets`).
 *
 * Requires QTCAAC_ASSET_BASE. Entries are pulled on demand from
 * `assets/<name>/<manifest.path>`; the dir is wiped whenever the slice
 * revision changes.
 */

type SliceManifest = { revision: string; path: string };

const CONCURRENCY = 6;

export class CdnSlice {
	private readonly manifest;
	private readonly pending = new Map<string, Promise<void>>();
	private readonly missing = new Set<string>();
	private syncedRevision = '';

	constructor(
		readonly name: string,
		readonly dir: string,
	) {
		this.manifest = cached(5 * 60_000, () =>
			loadCdnJson<SliceManifest>(`assets/${name}/manifest.json`),
		);
	}

	/**
	 * Run `job(root)` once per key unless `marker` already exists locally.
	 * `job` returns false when the CDN has no such entry.
	 */
	async ensure(
		key: string,
		marker: string,
		job: (root: string) => Promise<boolean>,
	): Promise<void> {
		const base = runtimeAssetBase();
		if (!base) return;
		const current = await this.manifest();
		if (!current?.revision) return;
		this.sync(current.revision);
		if (this.missing.has(key) || existsSync(marker)) return;

		let run = this.pending.get(key);
		if (!run) {
			const rel = current.path.replace(/^\.?\/*/, '').replace(/\/*$/, '/');
			const root = `${base}/assets/${this.name}/${rel === '/' ? '' : rel}`;
			run = job(root)
				.then((found) => {
					if (!found) this.missing.add(key);
				})
				.catch((err) => console.error(`[${this.name}] ${key}:`, err))
				.finally(() => this.pending.delete(key));
			this.pending.set(key, run);
		}
		await run;
	}

	/** Fetch `url`; null on 4xx, retried on network errors / 5xx. */
	async fetch(url: string, retries = 2): Promise<Response | null> {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
			if (res.ok) return res;
			await res.body?.cancel();
			if (res.status < 500) return null;
		} catch (err) {
			if (retries <= 0) throw err;
		}
		if (retries <= 0) return null;
		return this.fetch(url, retries - 1);
	}

	/** Download `<root><rel>` for every rel into the local dir (bounded concurrency). */
	async download(root: string, rels: string[]): Promise<void> {
		const queue = [...rels];
		const worker = async () => {
			for (let rel = queue.shift(); rel; rel = queue.shift()) {
				const res = await this.fetch(`${root}${rel}`);
				if (!res) throw new Error(`missing ${rel}`);
				const dest = path.join(this.dir, rel);
				mkdirSync(path.dirname(dest), { recursive: true });
				writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
			}
		};
		await Promise.all(Array.from({ length: CONCURRENCY }, worker));
	}

	private sync(revision: string) {
		if (this.syncedRevision === revision) return;
		const stamp = path.join(this.dir, '.revision');
		let local = '';
		try {
			local = readFileSync(stamp, 'utf8').trim();
		} catch {
			/* first run */
		}
		if (local !== revision) {
			console.log(
				`[${this.name}] CDN revision ${revision} (local ${local || 'none'}) — resetting cache`,
			);
			mkdirSync(this.dir, { recursive: true });
			for (const entry of readdirSync(this.dir)) {
				rmSync(path.join(this.dir, entry), { recursive: true, force: true });
			}
			writeFileSync(stamp, `${revision}\n`);
		}
		this.pending.clear();
		this.missing.clear();
		this.syncedRevision = revision;
	}
}
