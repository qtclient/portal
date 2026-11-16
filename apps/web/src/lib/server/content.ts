import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Resolve a content file: the applied pack's `content/pack/<name>` wins over
 * the core default `content/<name>`.
 */
export function contentPath(name: string): string {
	const pack = resolve(process.cwd(), 'content/pack', name);
	if (existsSync(pack)) return pack;
	return resolve(process.cwd(), 'content', name);
}
