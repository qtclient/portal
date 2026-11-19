import type { Handle } from '@sveltejs/kit/hooks';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { randomUUID } from 'crypto';
import { locale } from 'svelte-i18n';

import { building } from '$app/env';
import { hooks as packHooks } from '$pack/hooks.server';

import { AccountType, isAccountType } from '#lib/accounts.js';
import { csrfHandle } from '#lib/server/csrf.js';
import { prisma } from '#lib/server/prisma.js';
import {
	getSession,
	isHttpsRequest,
	requireLogin,
	sidCookieOptions,
} from '#lib/server/session.js';
import { startTelemetryRetention } from '#lib/server/telemetry/retention.js';
import { resolve as resolveSiteUrl } from '#lib/siteRouter.js';

const unauthorized = new Response(null, {
	status: 401,
	headers: {
		location: '/account/login',
	},
});

async function updateInternationalPrices() {
	console.log('Updating international prices');
	try {
		const rates = await prisma.currencyExchangeRates.findMany({
			select: { currency: true, rate: true },
		});
		for (const { currency, rate } of rates) {
			console.log(`Updating ${currency} prices (rate: ${rate.toString()})`);
			const templateOffers = await prisma.coinOffers.findMany({
				where: { currency: 'USD' },
			});
			for (const offer of templateOffers) {
				await prisma.coinOffers.upsert({
					where: { amount_currency: { amount: offer.amount, currency } },
					update: {
						price: offer.price.mul(rate),
					},
					create: {
						...offer,
						id: randomUUID(),
						currency,
						price: offer.price.mul(rate),
					},
				});
			}
		}
	} catch (err) {
		console.error('[hooks] updateInternationalPrices failed:', err);
	}
}

// Skip DB work during `vite build` (adapter-node imports hooks).
if (!building) {
	console.log('Starting international price updater');
	void updateInternationalPrices();
	startTelemetryRetention();
}

const coreHandle = (async ({ event, resolve }) => {
	const lang =
		event.request.headers.get('accept-language')?.split(',')[0] || 'en';
	if (lang) {
		await locale.set(lang);
	}

	const { cookies, url, request } = event;

	const routed = resolveSiteUrl(url);
	if (routed) {
		// Absolute Location (e.g. PUBLIC_PAYMENTS_URL) — SvelteKit redirect()
		// throws redirect_external_not_allowed and can take down adapter-node.
		if (/^https?:\/\//i.test(routed)) {
			return new Response(null, {
				status: 302,
				headers: { location: routed },
			});
		}
		redirect(302, routed);
	}

	const sid = cookies.get('sid');
	if (sid) {
		const session = await getSession(sid);
		if (session) {
			event.locals.session = session;
		} else {
			cookies.delete('sid', sidCookieOptions(isHttpsRequest(request, url)));
		}
	}

	if (url.pathname.startsWith('/admin')) {
		requireLogin(event.locals, 'admin');

		const account = await prisma.accounts.findUnique({
			where: { id: event.locals.session?.accountId },
			select: { type: true },
		});
		if (!account || !isAccountType(account.type)) {
			return unauthorized;
		}
		if (!event.locals.session?.accountId || account.type !== AccountType.God) {
			return unauthorized;
		}
	}

	// /play boots WASM in-page — COOP/COEP for SharedArrayBuffer / pthreads.
	// Swap site-shell (Inter fonts) for play-shell so first paint stays light.
	const isPlay =
		url.pathname === '/play' ||
		url.pathname === '/play/' ||
		url.pathname.startsWith('/play/');

	const response = await resolve(event, {
		transformPageChunk: isPlay
			? ({ html }) =>
					html
						.replace(
							'class="dark" data-theme="site"',
							'class="dark play-mode" data-theme="site"',
						)
						.replace(
							'href="/styles/site-shell.css"',
							'href="/styles/play-shell.css"',
						)
						// Inline critical bg before CSS/JS: launcher→client
						// location.reload() must not flash the UA white page.
						.replace(
							'<head>',
							'<head><style>html,body{background:#0b0e12!important;color-scheme:dark}</style>',
						)
			: undefined,
	});

	if (isPlay) {
		// require-corp: Safari DataCloneError on SharedArrayBuffer → Worker
		// with credentialless even when the Worker script is same-origin+COEP.
		// Tip assets already send CORP: cross-origin (static CDN host).
		response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
		response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
		response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	}

	return response;
}) satisfies Handle;

export const handle: Handle = packHooks.handle
	? sequence(csrfHandle, packHooks.handle, coreHandle)
	: sequence(csrfHandle, coreHandle);
