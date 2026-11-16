import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ServerResponse } from 'node:http';

import type { Plugin } from 'vite';

/**
 * Same-origin static engine files for /play pthread Workers (dev only).
 *
 * Bare tibia.html boots because Workers load tip JS/wasm from a sync static
 * file server. SvelteKit `/play/em-pthread` proxies each Worker through an
 * async +server fetch; those requests stall once createWasm awaits the pool.
 * Serve `dist/cdn/launcher/*-web-current` like SimpleHTTP instead.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
/**
 * Local tip engine dirs (`launcher-web-current`, `tibiaclient-web-current`).
 * Default: a qtclient checkout next to this repo (`dist/cdn/launcher` of the
 * workspace root two levels up); override with QTCAAC_PLAY_ENGINE_DIR.
 */
const engineDir =
	process.env.QTCAAC_PLAY_ENGINE_DIR ||
	path.resolve(here, '../../../../dist/cdn/launcher');

const COEP = {
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
} as const;

const ROOTS: Record<string, string> = {
	tibia: path.join(engineDir, 'tibiaclient-web-current'),
	launcher: path.join(engineDir, 'launcher-web-current'),
};

const TYPES: Record<string, string> = {
	'.js': 'text/javascript; charset=utf-8',
	'.wasm': 'application/wasm',
	'.data': 'application/octet-stream',
	'.json': 'application/json',
};

function sendFile(
	res: ServerResponse,
	abs: string,
	ext: string,
): void {
	// Buffer the whole file — streaming pipe stalls under concurrent
	// pthread Worker fetches while createWasm awaits the pool (bare tip's
	// Python SimpleHTTP completes the same pattern with buffered sends).
	const body = fs.readFileSync(abs);
	res.statusCode = 200;
	for (const [k, v] of Object.entries(COEP)) res.setHeader(k, v);
	res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
	res.setHeader('Content-Length', String(body.byteLength));
	res.setHeader('Cache-Control', 'public, max-age=60');
	res.end(body);
}

export function playEnginePlugin(): Plugin {
	return {
		name: 'qtc-play-engine',
		configureServer(server) {
			server.middlewares.use((req, res, next) => {
				const raw = req.url ?? '';
				const pathname = raw.split('?')[0] ?? '';
				const m = pathname.match(
					/^\/play\/engine\/(tibia|launcher)\/([^/]+)$/,
				);
				if (!m) return next();
				const kind = m[1] as 'tibia' | 'launcher';
				const name = m[2]!;
				// Smoke HTML: inject COEP (Vite static bypasses hooks.server).
				if (name === 'test.html') {
					const htmlPath = path.join(
						here,
						'static/play/engine',
						kind,
						'test.html',
					);
					if (!fs.existsSync(htmlPath)) return next();
					const body = fs.readFileSync(htmlPath);
					res.statusCode = 200;
					for (const [k, v] of Object.entries(COEP)) res.setHeader(k, v);
					res.setHeader('Content-Type', 'text/html; charset=utf-8');
					res.setHeader('Content-Length', String(body.byteLength));
					res.end(body);
					return;
				}
				// Only tip engine binaries — leave other static alone.
				if (!/^(tibia|launcher|qtloader)\.(js|wasm|data)$/.test(name)) {
					return next();
				}
				if (name.includes('..') || name.includes('\\')) {
					res.statusCode = 400;
					res.end('bad path');
					return;
				}
				const abs = path.join(ROOTS[kind]!, name);
				if (!abs.startsWith(ROOTS[kind]!) || !fs.existsSync(abs)) {
					return next();
				}
				sendFile(res, abs, path.extname(name));
			});
		},
	};
}
