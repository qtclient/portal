/** Pure parsers for telemetry payloads (no I/O; unit-tested). */
import type { Frame } from './signature.js';

const MAX_FRAMES = 64;

const PLATFORMS = new Set(['windows', 'macos', 'linux', 'wasm', 'android', 'ios']);

export function normPlatform(raw: string | null | undefined, ua: string): string {
	const v = (raw ?? '').trim().toLowerCase();
	if (PLATFORMS.has(v)) return v;
	if (v.startsWith('win')) return 'windows';
	if (v.startsWith('mac') || v === 'darwin' || v === 'osx') return 'macos';
	if (v.startsWith('lin')) return 'linux';
	const u = ua.toLowerCase();
	if (u.includes('windows')) return 'windows';
	if (u.includes('mac os') || u.includes('darwin')) return 'macos';
	if (u.includes('linux')) return 'linux';
	return 'unknown';
}

/** CIP `yyyy-MM-dd hh:mm:ss,zzz` → Date. */
export function cipTimestamp(v: unknown): Date | null {
	if (typeof v !== 'string') return null;
	const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})(?:,(\d{1,3}))?$/.exec(v.trim());
	if (!m) return null;
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] ?? 0)));
	return Number.isNaN(d.getTime()) ? null : d;
}

/** `wasm-function[123]` + optional `:0x4a5b` byte offset (Chrome/Firefox). */
const WASM_FUNC = /wasm-function\[(\d+)\](?::(0x[0-9a-f]+))?/i;
/** Module file name ending in `.wasm` anywhere in the frame. */
const WASM_FILE = /([^/\s()@:]+\.wasm)\b/i;
/** `at fn (` (V8) or `fn@` (SpiderMonkey/JSC). */
const FN_NAME = /^(?:at\s+(\S+)\s+\(|([^@\s]+)@)/;
/** `https://host/a.js:10:5`. */
const JS_LOC = /([a-z]+:\/\/[^\s)]+?):(\d+):(\d+)\)?$/i;

export function parseBrowserStack(stack: string): Frame[] {
	const frames: Frame[] = [];
	for (const raw of stack.split('\n')) {
		const line = raw.trim();
		if (!line) continue;
		const fn = FN_NAME.exec(line);
		const name = fn ? (fn[1] ?? fn[2] ?? null) : null;
		const w = WASM_FUNC.exec(line);
		if (w) {
			const file = WASM_FILE.exec(line)?.[1] ?? 'wasm';
			// V8 names wasm frames `<module>.wasm.<fn>` or `$fn`; keep only real names.
			const fnName = name && !name.includes('wasm-function') ? name.replace(/^.*\.wasm\./, '') : null;
			frames.push({
				module: file,
				function: fnName && fnName !== file ? fnName : null,
				offset: w[2] ?? `func[${w[1]}]`,
			});
		} else {
			const j = JS_LOC.exec(line);
			if (j) {
				const file = j[1].replace(/[?#].*$/, '');
				frames.push({
					module: file.split('/').pop() ?? file,
					function: name,
					file,
					line: Number(j[2]),
					offset: `${j[2]}:${j[3]}`,
				});
			}
		}
		if (frames.length >= MAX_FRAMES) break;
	}
	return frames;
}
