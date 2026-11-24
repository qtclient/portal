import { createHash, randomUUID } from 'crypto';
import parseDuration from 'parse-duration';

import * as privateEnv from '$app/env/private';

import { PlayerSex, PlayerVocation } from '#lib/players.js';
import { prisma } from '#lib/server/prisma.js';
import {
	runtimeCrystalWebsocketPort,
	runtimeCrystalWebsocketPortUnprotected,
	runtimeGameWsHost,
	runtimeServerAddress,
	runtimeServerAddressUnprotected,
	runtimeServerPort,
	runtimeServerPortUnprotected,
} from '#lib/server/runtimeEnv.js';
import {
	listGameWorlds,
	locationCode,
	pvpTypeFromWorldType,
} from '#lib/server/worlds.js';

const FREE_PREMIUM = privateEnv.FREE_PREMIUM ?? '';
const GAME_SESSION_EXPIRATION_TIME =
	privateEnv.GAME_SESSION_EXPIRATION_TIME ?? '';

const SESSION_DURATION =
	parseDuration(GAME_SESSION_EXPIRATION_TIME ?? '1d') ?? 3600 * 24;

const LOGIN_VOCATION_NAMES: Record<number, string> = {
	[PlayerVocation.None]: 'None',
	[PlayerVocation.Sorcerer]: 'Sorcerer',
	[PlayerVocation.Druid]: 'Druid',
	[PlayerVocation.Paladin]: 'Paladin',
	[PlayerVocation.Knight]: 'Knight',
	[PlayerVocation.MasterSorcerer]: 'Master Sorcerer',
	[PlayerVocation.ElderDruid]: 'Elder Druid',
	[PlayerVocation.RoyalPaladin]: 'Royal Paladin',
	[PlayerVocation.EliteKnight]: 'Elite Knight',
	[PlayerVocation.Monk]: 'Monk',
	[PlayerVocation.ExaltedMonk]: 'Exalted Monk',
};

function loginVocationName(vocation: number): string {
	return LOGIN_VOCATION_NAMES[vocation] ?? 'None';
}

export const accountPlayersSelect = {
	name: true,
	sex: true,
	istutorial: true,
	level: true,
	looktype: true,
	vocation: true,
	lookhead: true,
	lookbody: true,
	looklegs: true,
	lookfeet: true,
	lookaddons: true,
	is_main: true,
	isreward: true,
	world_id: true,
	charbazaar: true,
	settings: true,
	online: { select: { player_id: true } },
} as const;

export type AccountWithPlayers = {
	id: number;
	email: string;
	lastday: number;
	players: Array<{
		name: string;
		sex: number;
		istutorial: boolean;
		level: number;
		looktype: number;
		vocation: number;
		lookhead: number;
		lookbody: number;
		looklegs: number;
		lookfeet: number;
		lookaddons: number;
		is_main: boolean;
		isreward: boolean;
		world_id: number | null;
		charbazaar: boolean;
		settings: { hidden?: boolean | null } | null;
		online: { player_id: number } | null;
	}>;
};

/** CipSoft login JSON: session + playdata only (no email/ssoswitch extras). */
export type OtcLoginResponse = {
	session: {
		sessionkey: string;
		lastlogintime: string;
		ispremium: boolean;
		premiumuntil: number;
		status: string;
		returnernotification: boolean;
		showrewardnews: boolean;
		isreturner: boolean;
		fpstracking: boolean;
		optiontracking: boolean;
		emailcoderequest: boolean;
	};
	playdata: {
		worlds: Array<{
			id: number;
			name: string;
			externaladdress: string;
			externalport: number;
			externaladdressprotected: string;
			externalportprotected: number;
			externaladdressunprotected: string;
			externalportunprotected: number;
			previewstate: number;
			location: string;
			anticheatprotection: boolean;
			pvptype: number;
			restrictedstore: boolean;
			websocketport: number;
			websocketportunprotected: number;
		}>;
		characters: Array<{
			worldid: number;
			name: string;
			ismale: boolean;
			tutorial: boolean;
			level: number;
			vocation: string;
			outfitid: number;
			headcolor: number;
			torsocolor: number;
			legscolor: number;
			detailcolor: number;
			addonsflags: number;
			/** Boolean (not 0/1): OTC Lua treats numeric 0 as truthy and would hide every character. */
			ishidden: boolean;
			ismaincharacter: boolean;
			dailyrewardstate: number;
			isonline: boolean;
		}>;
	};
};

function isPrivateIpv4(host: string): boolean {
	const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return false;
	const octets = m.slice(1).map(Number);
	if (octets.some((n) => n > 255)) return false;
	const [a, b] = octets;
	if (a === 10 || a === 127) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	return false;
}

function isAdvertiseTrustedHost(host: string): boolean {
	if (
		host === 'localhost' ||
		host === '127.0.0.1' ||
		host === '::1' ||
		host === '0.0.0.0'
	) {
		return true;
	}
	if (isPrivateIpv4(host)) return true;
	return false;
}

function isLoopbackHost(host: string): boolean {
	return (
		host === 'localhost' ||
		host === '::1' ||
		host === '0.0.0.0' ||
		/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
	);
}

/**
 * CipSoft's unprotected endpoint host for a world whose protected host is
 * `address`: SERVER_ADDRESS_UNPROTECTED for this server's own host
 * (QTCAAC_GAME_WS_HOST / SERVER_ADDRESS / loopback), never a loopback name
 * for a public host. Otherwise the protected host (the client then keeps one
 * connection, as CipSoft's client does when both endpoints are equal).
 */
export function unprotectedAddressFor(address: string): string {
	const unprotected = runtimeServerAddressUnprotected();
	if (!unprotected || isLoopbackHost(unprotected) !== isLoopbackHost(address)) {
		return address;
	}
	const own = [runtimeGameWsHost(), runtimeServerAddress()].filter(Boolean);
	return own.includes(address) || isLoopbackHost(address)
		? unprotected
		: address;
}

export function resolveClientAdvertise(request: Request): {
	address: string;
	websocketPort: number;
	websocketPortUnprotected: number;
	gamePort: number;
	gamePortUnprotected: number;
} {
	const url = new URL(request.url);
	const raw =
		request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
		request.headers.get('host') ||
		url.host;

	let address = raw;
	const ipv6 = raw.match(/^\[([^\]]+)\](?::(\d+))?$/);
	if (ipv6) {
		address = ipv6[1];
	} else {
		const m = raw.match(/^(.+):(\d+)$/);
		if (m) address = m[1];
	}

	const envAddress = runtimeServerAddress();
	const pinnedPublic = !!envAddress && !isAdvertiseTrustedHost(envAddress);

	if (pinnedPublic) {
		address = envAddress;
	} else if (!address || !isAdvertiseTrustedHost(address)) {
		address = envAddress || '127.0.0.1';
	}

	const websocketPort = runtimeCrystalWebsocketPort();
	const websocketPortUnprotected = runtimeCrystalWebsocketPortUnprotected();
	const gamePort = parseInt(runtimeServerPort(), 10) || 7171;
	const gamePortUnprotected = runtimeServerPortUnprotected();
	const ports = {
		websocketPort,
		websocketPortUnprotected,
		gamePort,
		gamePortUnprotected,
	};

	const gameWsHost = runtimeGameWsHost();
	if (gameWsHost) {
		return { address: gameWsHost, ...ports };
	}

	return { address, ...ports };
}

/** Create Crystal `account_sessions` row; returns plaintext session key for OTC. */
export async function createGameSessionKey(accountId: number): Promise<string> {
	const sessionKey = randomUUID();
	const hashedSessionId = createHash('sha1').update(sessionKey).digest('hex');
	await prisma.gameAccountSessions.create({
		data: {
			id: hashedSessionId,
			account_id: accountId,
			expires: Math.trunc((Date.now() + SESSION_DURATION) / 1000),
		},
	});
	return sessionKey;
}

/** Account of a live `account_sessions` row (the key the login answer handed out). */
export async function accountIdForGameSessionKey(
	sessionKey: string,
): Promise<number | null> {
	if (!sessionKey) return null;
	const session = await prisma.gameAccountSessions.findUnique({
		where: { id: createHash('sha1').update(sessionKey).digest('hex') },
	});
	if (!session || Number(session.expires) <= Math.trunc(Date.now() / 1000)) {
		return null;
	}
	return session.account_id;
}

export async function buildOtcLoginResponse(
	account: AccountWithPlayers,
	request: Request,
): Promise<OtcLoginResponse> {
	const sessionKey = await createGameSessionKey(account.id);
	const now = Math.trunc(Date.now() / 1000);
	const hasPaidPremium = account.lastday > now;
	const advertise = resolveClientAdvertise(request);
	const gameWorlds = await listGameWorlds();

	// CipSoft clientservices multi-world: playdata.worlds[] is the world list.
	// Each entry's `name` is what the client sends as the game-connect preamble;
	// characters.worldid selects which world.
	//
	// Host: when QTCAAC_GAME_WS_HOST is set (e.g. game.example.com), always
	// advertise that hostname — browsers open wss:// and reject certs on bare
	// IPs. Desktop TCP still reaches the same A-record :7171. Otherwise prefer
	// worlds.ip when set.
	//
	// As CipSoft's, each world has two game endpoints: the protected one (the
	// client's first connection) and the unprotected one (its secondary
	// connection). CipSoft serves both on port 7171 under two host names
	// (prod-cf-*/prod-lb-*.tibia.com); here SERVER_ADDRESS_UNPROTECTED.
	const preferTlsHost = !!runtimeGameWsHost();
	const loginWorlds = gameWorlds.map((world) => {
		const tcpPort =
			Number(world.port) > 0 ? Number(world.port) : advertise.gamePort;
		const ip = (world.ip || '').trim();
		const address = preferTlsHost
			? advertise.address
			: ip && ip !== '0.0.0.0'
				? ip
				: advertise.address;
		return {
			id: world.id,
			name: world.name,
			externaladdress: address,
			externalport: tcpPort,
			externaladdressprotected: address,
			externalportprotected: tcpPort,
			externaladdressunprotected: unprotectedAddressFor(address),
			externalportunprotected: advertise.gamePortUnprotected,
			previewstate: 0,
			location: locationCode(world.location),
			anticheatprotection: false,
			pvptype: pvpTypeFromWorldType(world.type),
			restrictedstore: false,
			// Browser /play: Crystal WS listeners (not CipSoft fields; 0 = no
			// secondary connection).
			websocketport: advertise.websocketPort,
			websocketportunprotected: advertise.websocketPortUnprotected,
		};
	});

	return {
		session: {
			sessionkey: sessionKey,
			lastlogintime: '0',
			ispremium: hasPaidPremium || FREE_PREMIUM === 'true',
			premiumuntil: hasPaidPremium
				? account.lastday
				: FREE_PREMIUM === 'true'
					? 0
					: account.lastday,
			status: 'active',
			returnernotification: false,
			showrewardnews: true,
			isreturner: true,
			fpstracking: false,
			optiontracking: false,
			emailcoderequest: false,
		},
		playdata: {
			worlds: loginWorlds,
			characters: account.players
				.filter((player) => !player.charbazaar)
				.map((player) => ({
					worldid: player.world_id ?? gameWorlds[0]?.id ?? 0,
					name: player.name,
					ismale: player.sex === Number(PlayerSex.Male),
					// JSON booleans: the client reads 0/1 as missing (tutorial then defaults to true).
					tutorial: Boolean(player.istutorial),
					level: player.level,
					vocation: loginVocationName(player.vocation),
					outfitid: player.looktype,
					headcolor: player.lookhead,
					torsocolor: player.lookbody,
					legscolor: player.looklegs,
					detailcolor: player.lookfeet,
					addonsflags: player.lookaddons,
					ishidden: Boolean(player.settings?.hidden),
					ismaincharacter: Boolean(player.is_main),
					dailyrewardstate: player.isreward ? 1 : 0,
					isonline: player.online != null,
				})),
		},
	};
}
