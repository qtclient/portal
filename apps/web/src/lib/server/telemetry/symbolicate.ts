import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SourceMapConsumer } from 'source-map-js';

import { prisma } from '#lib/server/prisma.js';
import { stackwalkBinary, symbolsDir, telemetryDir } from '#lib/server/telemetry/config.js';
import { parseBrowserStack, parseSymbolMap } from '#lib/server/telemetry/parse.js';
import type { Frame } from '#lib/server/telemetry/signature.js';

export type Symbolicated = {
	frames: Frame[];
	crashType: string;
	/** True when at least one frame resolved to a function name. */
	resolved: boolean;
	metadata?: Record<string, unknown>;
};

type StackwalkFrame = {
	module?: string;
	function?: string;
	file?: string;
	line?: number;
	module_offset?: string;
	offset?: string;
};

type StackwalkJson = {
	crash_info?: { type?: string; address?: string; crashing_thread?: number };
	crashing_thread?: { frames?: StackwalkFrame[] };
	threads?: { frames?: StackwalkFrame[] }[];
	system_info?: { os?: string; os_ver?: string; cpu_arch?: string; cpu_info?: string };
	modules?: unknown[];
};

const MAX_FRAMES = 64;

function runStackwalk(dump: string): Promise<StackwalkJson> {
	return new Promise((resolvePromise, reject) => {
		execFile(
			stackwalkBinary(),
			['--json', '--symbols-path', symbolsDir(), dump],
			{ maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
			(err, stdout) => {
				if (err && !stdout) return reject(err);
				try {
					resolvePromise(JSON.parse(stdout) as StackwalkJson);
				} catch (parseErr) {
					reject(parseErr);
				}
			},
		);
	});
}

/** Breakpad minidump → frames via rust-minidump `minidump-stackwalk`. */
export async function symbolicateMinidump(relPath: string): Promise<Symbolicated> {
	const json = await runStackwalk(join(telemetryDir(), relPath));
	const idx = json.crash_info?.crashing_thread;
	const raw =
		json.crashing_thread?.frames ??
		(typeof idx === 'number' ? json.threads?.[idx]?.frames : undefined) ??
		json.threads?.[0]?.frames ??
		[];
	const frames: Frame[] = raw.slice(0, MAX_FRAMES).map((f) => ({
		module: f.module ?? null,
		function: f.function ?? null,
		file: f.file ?? null,
		line: f.line ?? null,
		offset: f.module_offset ?? f.offset ?? null,
	}));
	return {
		frames,
		crashType: json.crash_info?.type ?? 'crash',
		resolved: frames.some((f) => !!f.function),
		metadata: {
			os: json.system_info?.os,
			osVersion: json.system_info?.os_ver,
			arch: json.system_info?.cpu_arch,
			cpu: json.system_info?.cpu_info,
			address: json.crash_info?.address,
		},
	};
}

// --- WASM / browser ---------------------------------------------------------

export type WasmCrashPayload = {
	message?: string;
	name?: string;
	stack?: string;
	stage?: string;
	revision?: string;
	userAgent?: string;
	url?: string;
	extra?: Record<string, unknown>;
};

const consumers = new Map<string, SourceMapConsumer | null>();

async function sourceMapFor(revision: string, wasmFile: string): Promise<SourceMapConsumer | null> {
	const key = `${revision}/${wasmFile}`;
	if (consumers.has(key)) return consumers.get(key)!;
	const row = await prisma.symbolFile.findUnique({
		where: {
			kind_debug_id_code_file: { kind: 'sourcemap', debug_id: revision, code_file: wasmFile },
		},
	});
	let consumer: SourceMapConsumer | null = null;
	const abs = row ? join(symbolsDir(), row.path) : '';
	if (abs && existsSync(abs)) {
		try {
			consumer = new SourceMapConsumer(JSON.parse(readFileSync(abs, 'utf8')));
		} catch {
			consumer = null;
		}
	}
	if (consumers.size > 32) consumers.clear();
	consumers.set(key, consumer);
	return consumer;
}

const symbolMaps = new Map<string, Map<number, string> | null>();

async function symbolMapFor(revision: string, wasmFile: string): Promise<Map<number, string> | null> {
	const key = `${revision}/${wasmFile}`;
	if (symbolMaps.has(key)) return symbolMaps.get(key)!;
	const row = await prisma.symbolFile.findUnique({
		where: {
			kind_debug_id_code_file: { kind: 'symbolmap', debug_id: revision, code_file: wasmFile },
		},
	});
	const abs = row ? join(symbolsDir(), row.path) : '';
	const map = abs && existsSync(abs) ? parseSymbolMap(readFileSync(abs, 'utf8')) : null;
	if (symbolMaps.size > 8) symbolMaps.clear();
	symbolMaps.set(key, map);
	return map;
}

/** Forget cached symbol data for a revision (a new upload replaced it). */
export function forgetSymbols(revision: string): void {
	for (const cache of [consumers, symbolMaps] as Map<string, unknown>[])
		for (const key of [...cache.keys()]) if (key.startsWith(`${revision}/`)) cache.delete(key);
}

/** Browser payload → frames; WASM frames resolve through the uploaded symbol map
 * (function index, every browser) or source map (byte offset, V8/SpiderMonkey). */
export async function symbolicateWasm(payload: WasmCrashPayload, revision: string): Promise<Symbolicated> {
	const frames = parseBrowserStack(payload.stack ?? '');
	// JSC stacks name no module for blob-loaded wasm; the page says which engine ran.
	const engine = typeof payload.extra?.engine === 'string' ? payload.extra.engine : 'tibia.wasm';
	for (const f of frames) {
		if (f.index == null && !f.module?.endsWith('.wasm')) continue;
		if (!f.module?.endsWith('.wasm')) f.module = engine;
		if (!f.function && f.index != null) {
			const name = (await symbolMapFor(revision, f.module))?.get(f.index);
			if (name) f.function = name;
		}
		if (!f.offset?.startsWith('0x')) continue;
		const map = await sourceMapFor(revision, f.module);
		if (!map) continue;
		// Emscripten -gsource-map: line 1, column = byte offset in the module.
		const pos = map.originalPositionFor({ line: 1, column: parseInt(f.offset, 16) });
		if (pos.source) {
			f.file = pos.source;
			f.line = pos.line ?? null;
			f.function = f.function ?? pos.name ?? null;
		}
	}
	return {
		frames,
		crashType: payload.name || 'Error',
		resolved: frames.some((f) => !!f.function),
		metadata: {
			message: payload.message?.slice(0, 2000),
			stage: payload.stage,
			userAgent: payload.userAgent?.slice(0, 512),
		},
	};
}
