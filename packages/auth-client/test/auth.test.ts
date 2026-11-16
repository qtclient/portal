import { afterAll, describe, expect, test } from 'bun:test';

import { AuthError, createAuthClient } from '../src/index.js';

const TOKEN = 'idt_device';
let revoked = false;

const server = Bun.serve({
	port: 0,
	async fetch(req) {
		const url = new URL(req.url);
		const auth = req.headers.get('authorization');
		const body =
			req.method === 'POST'
				? ((await req.json()) as Record<string, string>)
				: {};
		const deviceOk = auth === `Bearer ${TOKEN}` && !revoked;

		if (url.pathname === '/api/auth/switch') {
			return body.code === 'switch-1'
				? Response.json({ ok: true, email: 'other@b.c' })
				: Response.json(
						{ ok: false, errors: { global: ['Account switch code expired.'] } },
						{ status: 401 },
					);
		}
		if (url.pathname === '/api/auth/device' && req.method === 'POST') {
			if (body.code !== undefined) {
				return body.code === 'switch-1'
					? Response.json({
							ok: true,
							email: 'other@b.c',
							deviceId: 'dev2',
							token: 'idt_other',
						})
					: Response.json(
							{
								ok: false,
								errors: { global: ['Account switch code expired.'] },
							},
							{ status: 401 },
						);
			}
			if (body.password !== 'secret') {
				return Response.json(
					{ ok: false, errors: { global: ['Invalid email or password'] } },
					{ status: 400 },
				);
			}
			if (!body.token) return Response.json({ tokenRequired: true });
			return Response.json({
				ok: true,
				email: body.email,
				deviceId: 'dev1',
				token: TOKEN,
			});
		}
		if (url.pathname === '/api/auth/device' && req.method === 'GET') {
			return deviceOk
				? Response.json({
						ok: true,
						email: 'a@b.c',
						deviceId: 'dev1',
						name: 'pc',
					})
				: Response.json({ ok: false }, { status: 401 });
		}
		if (url.pathname === '/api/auth/device' && req.method === 'DELETE') {
			if (!deviceOk) return Response.json({ ok: false }, { status: 401 });
			revoked = true;
			return Response.json({ ok: true });
		}
		return new Response('not found', { status: 404 });
	},
});

afterAll(() => server.stop(true));

const client = createAuthClient({
	baseUrl: `http://127.0.0.1:${server.port}/`,
});

describe('auth-client', () => {
	test('device login walks through 2FA', async () => {
		const bad = await client.deviceLogin({ email: 'a@b.c', password: 'nope' });
		expect(bad).toMatchObject({ ok: false, tokenRequired: false, status: 400 });

		const needs2fa = await client.deviceLogin({
			email: 'a@b.c',
			password: 'secret',
		});
		expect(needs2fa).toMatchObject({ ok: false, tokenRequired: true });

		const ok = await client.deviceLogin({
			email: 'a@b.c',
			password: 'secret',
			token: '123456',
			deviceName: 'pc',
		});
		expect(ok).toEqual({
			ok: true,
			email: 'a@b.c',
			deviceId: 'dev1',
			token: TOKEN,
		});
	});

	test('device token → info, logout', async () => {
		expect(await client.deviceInfo(TOKEN)).toEqual({
			email: 'a@b.c',
			deviceId: 'dev1',
			name: 'pc',
		});

		await client.deviceLogout(TOKEN);
		// Logging out twice is not an error.
		await client.deviceLogout(TOKEN);

		const err = await client.deviceInfo(TOKEN).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).unauthorized).toBe(true);
	});

	test('switch code → website session or device token', async () => {
		expect(await client.switchWeb('switch-1')).toEqual({ email: 'other@b.c' });
		expect(await client.deviceFromSwitch('switch-1', 'pc')).toEqual({
			ok: true,
			email: 'other@b.c',
			deviceId: 'dev2',
			token: 'idt_other',
		});

		const err = await client.switchWeb('stale').catch((e: unknown) => e);
		expect(err).toBeInstanceOf(AuthError);
		expect((err as AuthError).message).toBe('Account switch code expired.');
	});
});
