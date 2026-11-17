/**
 * Shared POST handlers for CipSoft clientservices JSON endpoints.
 * Primary paths: /clientservices/loginservice.php + clientservices.php
 * Legacy multiplex: /api/login, /api/clientservices, /status
 */

import {
	clientRevisionFromRequest,
	type clientUpdatePayload,
	outdatedClientError,
} from '#lib/server/clientVersion.js';
import { requireEmailVerification } from '#lib/server/config.js';
import {
	accountPlayersSelect,
	type AccountWithPlayers,
	buildOtcLoginResponse,
} from '#lib/server/otcLogin.js';
import {
	buildBoostedCreature,
	buildCacheInfo,
	buildEventSchedule,
	buildNews,
	buildShowOff,
} from '#lib/server/otcStatus.js';
import { hooks as packHooks } from '$pack/hooks.server';

import { prisma } from '#lib/server/prisma.js';
import { checkTotp } from '#lib/server/totp.js';
import { comparePassword } from '#lib/server/utils.js';

export type ClientServicesStatusType =
	| 'cacheinfo'
	| 'boostedcreature'
	| 'eventschedule'
	| 'news'
	| 'newsviewed'
	| 'showoff';

export interface LoginParams {
	type: 'login';
	email: string;
	password: string;
	token?: string;
	clientRevision?: string;
	revision?: string;
	stayloggedin?: boolean;
}

type StatusParams = { type: ClientServicesStatusType; viewedid?: number };

type MultiplexParams = StatusParams | LoginParams;

interface ErrorResponse {
	errorCode: number;
	errorMessage: string;
	qtclient?: ReturnType<typeof clientUpdatePayload>;
	retry?: true;
}

const STATUS_TYPES = new Set<string>([
	'cacheinfo',
	'boostedcreature',
	'eventschedule',
	'news',
	'newsviewed',
	'showoff',
]);

export async function handleLoginPost(request: Request): Promise<Response> {
	try {
		const params = (await request.json()) as LoginParams;
		if (params.type !== 'login') {
			return Response.json({
				errorCode: 1,
				errorMessage: `Unknown login type: ${(params as { type?: string }).type || '(empty)'}`,
			});
		}
		void params.stayloggedin;
		return Response.json(await handleLogin(params, request));
	} catch (error) {
		console.warn('[loginservice] failed', error);
		return Response.json(
			{ errorCode: 1, errorMessage: 'Internal login error.' },
			{ status: 500 },
		);
	}
}

export async function handleClientServicesPost(
	request: Request,
): Promise<Response> {
	try {
		const params = (await request.json()) as StatusParams;
		return await dispatchStatus(params, request);
	} catch (error) {
		console.warn('[clientservices] failed', error);
		return Response.json(
			{ errorCode: 1, errorMessage: 'Internal clientservices error.' },
			{ status: 500 },
		);
	}
}

/** Legacy multiplex: login + status types on one URL. */
export async function handleClientServicesMultiplex(
	request: Request,
): Promise<Response> {
	try {
		const params = (await request.json()) as MultiplexParams & {
			stayloggedin?: boolean;
		};
		if (params.type === 'login') {
			void params.stayloggedin;
			return Response.json(await handleLogin(params, request));
		}
		return await dispatchStatus(params as StatusParams, request);
	} catch (error) {
		console.warn('[login] failed', error);
		return Response.json(
			{ errorCode: 1, errorMessage: 'Internal login error.' },
			{ status: 500 },
		);
	}
}

async function dispatchStatus(
	params: StatusParams,
	request: Request,
): Promise<Response> {
	switch (params.type) {
		case 'news':
			return Response.json(await buildNews());
		case 'newsviewed':
			// CIP TNewsViewsUploader reports `{type:"newsviewed", viewedid}` when a
			// news entry is opened and ignores the answer beyond errorCode.
			return Response.json({});
		case 'showoff':
			return Response.json(
				(await packHooks.showoff?.({ request })) ?? buildShowOff(),
			);
		case 'cacheinfo':
			return Response.json(await buildCacheInfo());
		case 'boostedcreature':
			return Response.json(await buildBoostedCreature());
		case 'eventschedule':
			return Response.json(await buildEventSchedule());
		default: {
			const unknown = params as { type?: string };
			if (unknown.type && STATUS_TYPES.has(unknown.type)) {
				// Exhaustiveness fallback — should not reach.
			}
			return Response.json({
				errorCode: 1,
				errorMessage: `Unknown login type: ${unknown.type || '(empty)'}`,
			});
		}
	}
}

async function handleLogin(
	params: LoginParams,
	request: Request,
): Promise<Awaited<ReturnType<typeof buildOtcLoginResponse>> | ErrorResponse> {
	const outdated = await outdatedClientError(
		clientRevisionFromRequest(request, params),
	);
	if (outdated) return outdated;

	const account = await prisma.accounts.findUnique({
		where: { email: params.email },
		include: {
			players: {
				select: accountPlayersSelect,
				where: { deletion: 0 },
			},
		},
	});
	if (!account || !comparePassword(params.password, account.password)) {
		return {
			errorCode: 3,
			errorMessage: 'Email or password is not correct.',
		};
	}

	if (requireEmailVerification && !account.is_verified) {
		return {
			errorCode: 5,
			errorMessage:
				'Your account has not been verified. Please check your email to verify your account.',
		};
	}

	if (account.token_secret && !params.token) {
		return {
			errorCode: 6,
			errorMessage: 'Two-factor token required for authentication',
		};
	}

	if (
		account.token_secret &&
		params.token &&
		!checkTotp(params.token, account.token_secret)
	) {
		return {
			errorCode: 6,
			errorMessage: 'Two-factor token is not correct.',
		};
	}

	const response = await buildOtcLoginResponse(
		account as AccountWithPlayers,
		request,
	);
	if (!packHooks.loginResponse) return response;
	const extended = await packHooks.loginResponse(
		response as unknown as Record<string, unknown>,
		{ request, accountId: account.id },
	);
	return (extended ?? response) as typeof response;
}
