import { type Cookies, redirect } from '@sveltejs/kit';
import invariant from 'tiny-invariant';

import { building } from '$app/env';

import { AccountType, isAccountType } from '#lib/accounts.js';
import { prisma } from '#lib/server/prisma.js';

export type SessionInfo = {
	accountId: number;
	email: string;
	// This is just a cache, can be used to present UI elements but shouldn't be used for authorization
	type: AccountType;
	expires: number;
};
type Sid = string;

const sessionStore = new Map<Sid, SessionInfo>();

/** Browsers drop `Secure` cookies on http://127.0.0.1; only set it for HTTPS. */
export function isHttpsRequest(request: Request, url: URL): boolean {
	const forwarded = request.headers
		.get('x-forwarded-proto')
		?.split(',')[0]
		?.trim();
	if (forwarded) {
		return forwarded === 'https';
	}
	return url.protocol === 'https:';
}

export function sidCookieOptions(secure: boolean, maxAgeSeconds?: number) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		...(maxAgeSeconds != null ? { maxAge: maxAgeSeconds } : {}),
	};
}

export async function performLogin(
	cookies: Cookies,
	email: string,
	secure = false,
) {
	const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 days
	const sid = await createSession(email, maxAgeSeconds);
	cookies.set('sid', sid, sidCookieOptions(secure, maxAgeSeconds));
}

export async function createSession(
	email: string,
	maxAgeSeconds: number,
): Promise<string> {
	const account = await prisma.accounts.findUnique({
		where: { email },
	});
	invariant(account, 'Account not found');
	invariant(isAccountType(account.type), 'Invalid account type');

	const expiresAt = Date.now() + maxAgeSeconds * 1000;
	const session = await prisma.accountSessions.create({
		data: {
			account_id: account.id,
			expires: expiresAt,
		},
	});
	sessionStore.set(session.id, {
		accountId: account.id,
		email: account.email,
		type: account.type,
		expires: expiresAt,
	});

	return session.id;
}

export async function deleteSession(sid: Sid) {
	sessionStore.delete(sid);
	await prisma.accountSessions.delete({ where: { id: sid } });
}

export async function getSession(sid: Sid): Promise<SessionInfo | undefined> {
	if (sessionStore.has(sid)) {
		const session = sessionStore.get(sid);
		if (session) {
			if (Date.now() > session.expires) {
				await deleteSession(sid);
				return undefined;
			}
			return session;
		}
	}

	const session = await prisma.accountSessions.findUnique({
		where: { id: sid },
		include: { account: { select: { id: true, email: true, type: true } } },
	});

	if (session) {
		const expires = Number(session.expires);
		if (Date.now() > expires) {
			await deleteSession(sid);
			return undefined;
		} else {
			const sessionInfo: SessionInfo = {
				accountId: session.account.id,
				email: session.account.email,
				type: session.account.type,
				expires,
			};
			return sessionInfo;
		}
	} else {
		return undefined;
	}
}

const cleanInterval = 1000 * 60 * 60; // 1 hour
async function clean() {
	try {
		await prisma.accountSessions.deleteMany({
			where: { expires: { lt: Date.now() } },
		});
	} catch (err) {
		console.error('[session] clean failed:', err);
		return;
	}
	const now = Date.now();
	for (const [sid, session] of sessionStore) {
		if (session.expires < now) {
			sessionStore.delete(sid);
		}
	}
}

// Skip DB work during `vite build` (adapter-node imports this module).
if (!building) {
	void clean();

	setInterval(() => {
		void clean();
	}, cleanInterval);
}

export function requireLogin(
	locals: App.Locals,
	_prefix = '',
): asserts locals is App.Locals & { session: SessionInfo } {
	if (!locals.session) {
		redirect(302, '/account/login' /* path.join('/', prefix, 'login') */); // TODO: admin specific login page
	}
}
