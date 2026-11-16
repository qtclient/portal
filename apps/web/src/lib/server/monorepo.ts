import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

let cached: string | null | undefined;

/**
 * Umbrella checkout root (has apps/qtclient + apps/crystalserver) when running
 * from the monorepo in dev; null in the production image.
 */
export function monorepoRoot(): string | null {
	if (cached !== undefined) return cached;
	let dir = resolve(process.cwd());
	for (let i = 0; i < 8; i++) {
		if (
			existsSync(join(dir, 'apps/qtclient')) &&
			existsSync(join(dir, 'apps/crystalserver'))
		) {
			return (cached = dir);
		}
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return (cached = null);
}

/** Absolute path inside the umbrella checkout, or null outside the monorepo. */
export function fromMonorepo(...parts: string[]): string | null {
	const root = monorepoRoot();
	return root ? join(root, ...parts) : null;
}
