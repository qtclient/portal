import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

function env(name: string): string {
	return (process.env[name] ?? '').trim();
}

function envInt(name: string, fallback: number): number {
	const n = Number(env(name) || fallback);
	return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

/** Root for minidumps, WASM payloads and the Breakpad symbol store. */
export function telemetryDir(): string {
	return resolve(process.cwd(), env('QTCAAC_TELEMETRY_DIR') || 'data/telemetry');
}

export function symbolsDir(): string {
	return resolve(telemetryDir(), 'symbols');
}

export function dumpsDir(): string {
	return resolve(telemetryDir(), 'dumps');
}

/** Max accepted crash upload (bytes). */
export function crashMaxBytes(): number {
	return envInt('QTCAAC_CRASH_MAX_BYTES', 32 * 1024 * 1024);
}

/** Max accepted symbol upload (bytes). */
export function symbolMaxBytes(): number {
	return envInt('QTCAAC_SYMBOL_MAX_BYTES', 512 * 1024 * 1024);
}

export function retentionDays(): number {
	return envInt('QTCAAC_TELEMETRY_RETENTION_DAYS', 90);
}

/** Bearer token CI uses to upload symbols. Empty = uploads disabled. */
export function symbolUploadToken(): string {
	return env('QTCAAC_SYMBOL_UPLOAD_TOKEN');
}

/** `minidump-stackwalk` binary (rust-minidump). Empty = not installed. */
export function stackwalkBinary(): string {
	return env('QTCAAC_MINIDUMP_STACKWALK') || 'minidump-stackwalk';
}

/** "false" disables all telemetry ingest (endpoints still answer 204). */
export function telemetryEnabled(): boolean {
	return env('QTCAAC_TELEMETRY_ENABLED').toLowerCase() !== 'false';
}

/** Salted hash so raw client IPs are never stored. */
export function hashIp(ip: string | null | undefined): string | null {
	if (!ip) return null;
	const salt = env('QTCAAC_TELEMETRY_SALT');
	return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
