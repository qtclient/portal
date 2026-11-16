import { describe, expect, test } from 'bun:test';

import { cipTimestamp, crashRevision, normPlatform, parseBrowserStack, pickCrashParts } from './parse.js';
import { signatureOf, titleOf } from './signature.js';

describe('signatureOf', () => {
	const frames = [
		{ module: 'libc.so', function: 'abort' },
		{ module: 'client', function: 'TGame::tick()' },
		{ module: 'client', function: 'main' },
	];

	test('skips noise frames and is stable', () => {
		const a = signatureOf(frames, 'SIGSEGV');
		const b = signatureOf(frames.slice(1), 'SIGSEGV');
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{40}$/);
	});

	test('crash type is part of the signature', () => {
		expect(signatureOf(frames, 'SIGSEGV')).not.toBe(signatureOf(frames, 'SIGABRT'));
	});

	test('title names the first symbolicated frame', () => {
		expect(titleOf(frames, 'SIGSEGV')).toBe('SIGSEGV in libc.so!abort');
	});
});

describe('parseBrowserStack', () => {
	test('chrome wasm + js frames', () => {
		const frames = parseBrowserStack(
			[
				'RuntimeError: unreachable',
				'    at tibia.wasm.foo (https://cdn.example/client/abc/wasm/tibia.wasm:wasm-function[123]:0x4a5b)',
				'    at callMain (https://cdn.example/client/abc/wasm/tibia.js:10:5)',
			].join('\n'),
		);
		expect(frames[0]).toMatchObject({ module: 'tibia.wasm', function: 'foo', offset: '0x4a5b' });
		expect(frames[1]).toMatchObject({ module: 'tibia.js', function: 'callMain', line: 10 });
	});

	test('firefox frames', () => {
		const frames = parseBrowserStack('boot@https://site.example/play/app.js:3:7');
		expect(frames[0]).toMatchObject({ module: 'app.js', function: 'boot', line: 3 });
	});
});

describe('cipTimestamp', () => {
	test('parses CIP yyyy-MM-dd hh:mm:ss,zzz', () => {
		expect(cipTimestamp('2026-11-16 12:34:56,789')?.toISOString()).toBe(
			'2026-11-16T12:34:56.789Z',
		);
		expect(cipTimestamp('nope')).toBeNull();
	});
});

describe('normPlatform', () => {
	test('field wins, then user agent', () => {
		expect(normPlatform('Win64', '')).toBe('windows');
		expect(normPlatform('darwin', '')).toBe('macos');
		expect(normPlatform(null, 'Mozilla/5.0 (X11; Linux x86_64)')).toBe('linux');
		expect(normPlatform(null, '')).toBe('unknown');
	});
});

describe('pickCrashParts', () => {
	const file = (size: number, name: string) => ({ size, name });

	test('CIP form: minidump by name, sessiondump kept, annotations as fields', () => {
		const parts = pickCrashParts<{ size: number; name: string }>([
			['minidump', file(100, 'abc.dmp')],
			['sessiondump', file(5000, 'abc.dmp.session')],
			['Comment', 'it broke'],
			['ReportType', 'Full'],
			['Version', '15.33.c68982ec'],
		]);
		expect(parts.dump?.name).toBe('abc.dmp');
		expect(parts.sessiondump?.name).toBe('abc.dmp.session');
		expect(parts.fields).toEqual({ Comment: 'it broke', ReportType: 'Full', Version: '15.33.c68982ec' });
	});

	test('Breakpad/Crashpad name still wins; a larger session dump is never the dump', () => {
		const named = pickCrashParts<{ size: number; name: string }>([
			['other', file(900, 'big.bin')],
			['upload_file_minidump', file(100, 'x.dmp')],
		]);
		expect(named.dump?.name).toBe('x.dmp');
		const unnamed = pickCrashParts<{ size: number; name: string }>([
			['sessiondump', file(9000, 's.session')],
			['file', file(100, 'y.dmp')],
		]);
		expect(unnamed.dump?.name).toBe('y.dmp');
		expect(unnamed.sessiondump?.name).toBe('s.session');
	});

	test('largest file when nothing is named', () => {
		const parts = pickCrashParts<{ size: number; name: string }>([
			['a', file(10, 'a')],
			['b', file(30, 'b')],
		]);
		expect(parts.dump?.name).toBe('b');
		expect(parts.sessiondump).toBeNull();
	});
});

describe('crashRevision', () => {
	test('headers, then lowercase fields, then CIP Version', () => {
		expect(crashRevision(new Headers({ 'x-tibia-client': 'r1' }), { Version: 'v' })).toBe('r1');
		expect(crashRevision(new Headers(), { Version: '15.33.c68982ec' })).toBe('15.33.c68982ec');
		expect(crashRevision(new Headers(), { revision: 'r2', Version: 'v' })).toBe('r2');
		expect(crashRevision(new Headers(), {})).toBe('unknown');
	});
});

