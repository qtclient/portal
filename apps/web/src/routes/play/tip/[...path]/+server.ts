import { runtimeAssetBase } from '#lib/server/runtimeEnv.js';

import type { RequestHandler } from './$types';

/**
 * Same-origin tip proxy for the soft launcher WASM Module.
 *
 * Qt QNAM on /play sets Cache-Control (AlwaysNetwork) and hits cross-origin
 * :9080 / static tip hosts. Safari / Chrome device emulation then preflight
 * or PNA-fail, leaving the soft UI on "Loading launcher package configuration…".
 * Portal fetch already works cross-origin; only Module.ENV CDN must be same-origin.
 */
const hopHeaders = [
	'content-type',
	'content-length',
	'etag',
	'last-modified',
	'accept-ranges',
	'content-range',
	'cache-control',
] as const;

function tipBase(): string {
	return runtimeAssetBase().replace(/\/+$/, '');
}

function corsHeaders(): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
		'Access-Control-Allow-Headers':
			'Range, Content-Type, Cache-Control, If-None-Match, If-Modified-Since',
		'Access-Control-Expose-Headers':
			'Accept-Ranges, Content-Range, Content-Length, ETag',
		'Access-Control-Allow-Private-Network': 'true',
		'Cross-Origin-Resource-Policy': 'cross-origin',
		'Cross-Origin-Embedder-Policy': 'credentialless',
	};
}

async function proxy(path: string, request: Request): Promise<Response> {
	const base = tipBase();
	if (!base) return new Response('QTCAAC_ASSET_BASE unset', { status: 500 });
	const rel = path.replace(/^\/+/, '');
	if (!rel || rel.includes('..')) return new Response('bad path', { status: 400 });

	const upstreamUrl = `${base}/${rel}`;
	const headers: Record<string, string> = {
		'accept-encoding': 'identity',
	};
	for (const h of [
		'range',
		'if-none-match',
		'if-modified-since',
		'cache-control',
	] as const) {
		const v = request.headers.get(h);
		if (v) headers[h] = v;
	}

	const upstream = await fetch(upstreamUrl, {
		method: request.method,
		headers,
		redirect: 'follow',
	});
	if (!upstream.ok && upstream.status !== 304) {
		await upstream.body?.cancel();
		return new Response(`tip fetch failed (${upstream.status})`, {
			status: 502,
			headers: corsHeaders(),
		});
	}

	const out: Record<string, string> = { ...corsHeaders() };
	for (const h of hopHeaders) {
		const v = upstream.headers.get(h);
		if (v) out[h] = v;
	}
	if (!out['content-type'] && rel.endsWith('.json')) {
		out['content-type'] = 'application/json';
	}

	if (upstream.status === 304 || request.method === 'HEAD') {
		return new Response(null, { status: upstream.status, headers: out });
	}
	return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET: RequestHandler = async ({ params, request }) => {
	return proxy(params.path ?? '', request);
};

export const HEAD: RequestHandler = async ({ params, request }) => {
	return proxy(params.path ?? '', request);
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204, headers: corsHeaders() });
};
