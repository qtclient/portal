import { runtimeAssetBase } from '#lib/server/runtimeEnv.js';

import type { RequestHandler } from './$types';

/**
 * Same-origin COEP proxy for tip engine JS (pthread Workers).
 *
 * Safari DataCloneError: SharedArrayBuffer cannot be posted into a Worker
 * unless that Worker script is same-origin + COEP. Tip host stays
 * the static CDN; Workers load `/play/em-pthread/{launcher,tibia}.js`.
 *
 * Linked tip: qtclient is no longer MAIN_MODULE — proxy tibia.js unmodified.
 */
const TIP_JS: Record<string, string> = {
	'launcher.js': 'launcher/launcher-web-current/launcher.js',
	'tibia.js': 'launcher/tibiaclient-web-current/tibia.js',
};

const coepHeaders: Record<string, string> = {
	'Content-Type': 'text/javascript; charset=utf-8',
	'Cache-Control': 'public, max-age=60',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
};

function tipHref(name: string): string | null {
	const rel = TIP_JS[name];
	if (!rel) return null;
	const tip = runtimeAssetBase().replace(/\/+$/, '');
	if (!tip) return null;
	return `${tip}/${rel}`;
}

async function proxy(name: string, request: Request): Promise<Response> {
	const href = tipHref(name);
	if (!href) return new Response('unknown engine js', { status: 404 });

	const upstream = await fetch(href, {
		headers: {
			'accept-encoding': 'identity',
			...(request.headers.get('if-none-match')
				? { 'if-none-match': request.headers.get('if-none-match')! }
				: {}),
		},
		redirect: 'follow',
	});
	if (!upstream.ok && upstream.status !== 304) {
		await upstream.body?.cancel();
		return new Response('tip fetch failed', { status: 502 });
	}

	const headers = { ...coepHeaders };
	const etag = upstream.headers.get('etag');
	if (etag) headers.ETag = etag;

	if (upstream.status === 304 || request.method === 'HEAD') {
		return new Response(null, { status: upstream.status, headers });
	}
	const body: ArrayBuffer = await upstream.arrayBuffer();
	headers['Content-Length'] = String(body.byteLength);
	return new Response(body, { status: upstream.status, headers });
}

export const GET: RequestHandler = async ({ params, request }) => {
	return proxy(params.name ?? '', request);
};

export const HEAD: RequestHandler = async ({ params, request }) => {
	const res = await proxy(params.name ?? '', request);
	return new Response(null, { status: res.status, headers: res.headers });
};
