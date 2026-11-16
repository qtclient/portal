import { describe, expect, test } from 'bun:test';

import { cipTimestamp, normPlatform, parseBrowserStack } from './parse.js';
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
