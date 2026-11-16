/**
 * Debug symbol upload (CI → `POST /api/telemetry/symbols`, Bearer
 * QTCAAC_SYMBOL_UPLOAD_TOKEN, multipart field `file`).
 *
 * - Breakpad `.sym` (from `dump_syms`): first line
 *   `MODULE <os> <arch> <debug_id> <code_file>`; stored in the standard
 *   symbol-store layout `<code_file>/<debug_id>/<code_file>.sym` that
 *   `minidump-stackwalk --symbols-path` reads.
 * - WASM source map (`*.wasm.map`, Emscripten `-gsource-map`): needs a
 *   `revision` field; stored as `wasm/<revision>/<file>`.
 */
import { createReadStream, existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { timingSafeEqual } from 'node:crypto';

import { prisma } from '#lib/server/prisma.js';
import { symbolMaxBytes, symbolsDir, symbolUploadToken } from '#lib/server/telemetry/config.js';
import { reprocessUnsymbolicated } from '#lib/server/telemetry/process.js';

const SAFE = /^[A-Za-z0-9._+-]{1,200}$/;

function authorized(request: Request): boolean {
	const token = symbolUploadToken();
	if (!token) return false;
	const got = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
	const a = Buffer.from(got);
	const b = Buffer.from(token);
	return a.length === b.length && timingSafeEqual(a, b);
}

async function firstLine(path: string): Promise<string> {
	const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	for await (const line of rl) {
		rl.close();
		return line;
	}
	return '';
}

export async function uploadSymbols(request: Request): Promise<Response> {
	if (!symbolUploadToken()) return new Response('symbol upload disabled', { status: 404 });
	if (!authorized(request)) return new Response('unauthorized', { status: 401 });
	const len = Number(request.headers.get('content-length') ?? 0);
	if (len > symbolMaxBytes()) return new Response('too large', { status: 413 });

	const form = await request.formData();
	const file = form.get('file');
	if (!file || typeof file === 'string') return new Response('missing file', { status: 400 });
	const name = basename(file.name || '');

	const tmpDir = join(symbolsDir(), '.incoming');
	mkdirSync(tmpDir, { recursive: true });
	const tmp = join(tmpDir, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
	writeFileSync(tmp, new Uint8Array(await file.arrayBuffer()));
	try {
		return await storeSymbol(tmp, name, form);
	} finally {
		if (existsSync(tmp)) rmSync(tmp, { force: true });
	}
}

async function storeSymbol(tmp: string, name: string, form: FormData): Promise<Response> {

	let kind: 'breakpad' | 'sourcemap';
	let debugId: string;
	let codeFile: string;
	let os: string | null = null;
	let arch: string | null = null;
	let rel: string;

	if (name.endsWith('.map')) {
		const revision = String(form.get('revision') ?? '').trim();
		if (!SAFE.test(revision) || !SAFE.test(name)) {
			return new Response('source maps need a safe `revision` and file name', { status: 400 });
		}
		kind = 'sourcemap';
		debugId = revision;
		codeFile = name.replace(/\.map$/, '');
		rel = join('wasm', revision, name);
	} else {
		const head = (await firstLine(tmp)).trim().split(/\s+/);
		if (head[0] !== 'MODULE' || head.length < 5) {
			return new Response('not a Breakpad .sym file', { status: 400 });
		}
		[, os, arch, debugId] = head;
		codeFile = head.slice(4).join(' ');
		if (!SAFE.test(debugId) || !SAFE.test(codeFile)) {
			return new Response('unsafe debug id or module name', { status: 400 });
		}
		kind = 'breakpad';
		const symName = codeFile.replace(/\.(pdb|dll|exe)$/i, '') + '.sym';
		rel = join(codeFile, debugId, symName);
	}

	const abs = join(symbolsDir(), rel);
	mkdirSync(dirname(abs), { recursive: true });
	renameSync(tmp, abs);
	const size = statSync(abs).size;

	await prisma.symbolFile.upsert({
		where: { kind_debug_id_code_file: { kind, debug_id: debugId, code_file: codeFile } },
		create: { kind, debug_id: debugId, code_file: codeFile, os, arch, path: rel, size },
		update: { os, arch, path: rel, size, uploaded_at: new Date() },
	});
	const requeued = await reprocessUnsymbolicated();
	return Response.json({ kind, debugId, codeFile, size, requeued }, { status: 201 });
}
