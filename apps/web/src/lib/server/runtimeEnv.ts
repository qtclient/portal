/**
 * Runtime-only env for values that must follow Coolify/process env after build.
 *
 * The image is built without a `.env`, and the entrypoint fills unset keys
 * from `.env.dist`.
 */

function read(key: string, fallback = ''): string {
	const v = process.env[key];
	return typeof v === 'string' && v.length > 0 ? v : fallback;
}

export function runtimeServerAddress(): string {
	return read('SERVER_ADDRESS', '127.0.0.1').trim();
}

export function runtimeServerPort(): string {
	return read('SERVER_PORT', '7172');
}

/** CipSoft login `externalportunprotected`: the game server's second endpoint (the client's secondary connection). */
export function runtimeServerPortUnprotected(): number {
	const n = Number(read('SERVER_PORT_UNPROTECTED', '7175'));
	return Number.isFinite(n) && n > 0 ? n : 7175;
}

export function runtimeStatusPort(): string {
	return read('STATUS_PORT', '7171');
}

/** Bootstrap CipSoft world name when `worlds` is empty — keep in sync with Crystal serverName / WORLD_ID row. */
export function runtimeServerName(): string {
	return read('SERVER_NAME', 'Server');
}

export function runtimePvpType(): string {
	return read('PVP_TYPE', 'no-pvp');
}

/** Browser OTC game WebSocket port advertised in login JSON. */
export function runtimeCrystalWebsocketPort(): number {
	const n = Number(read('QTCAAC_CRYSTAL_WEBSOCKET_PORT', '7174'));
	return Number.isFinite(n) && n > 0 ? n : 7174;
}

/**
 * Browser secondary connection: the game server's second WebSocket port, advertised
 * in login JSON as `websocketportunprotected` (not a CipSoft field). 0 = none.
 */
export function runtimeCrystalWebsocketPortUnprotected(): number {
	const n = Number(read('QTCAAC_CRYSTAL_WEBSOCKET_PORT_UNPROTECTED', '7176'));
	return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Optional TLS-terminated game WS host.
 * When set, login advertises this host + QTCAAC_CRYSTAL_WEBSOCKET_PORT (usually 443)
 * instead of SERVER_ADDRESS — required for HTTPS play (mixed-content blocks ws://).
 */
export function runtimeGameWsHost(): string {
	return read('QTCAAC_GAME_WS_HOST', '').trim();
}

/**
 * CDN tip origin (CIP layout). Prefers QTCLIENT_ASSET_BASE (client contract),
 * then QTCAAC_ASSET_BASE. Local default: http://127.0.0.1:9080 (make infra cdn);
 * prod: your static CDN host. Required — no same-origin `/cdn` fallback.
 */
export function runtimeAssetBase(): string {
	const v = read('QTCLIENT_ASSET_BASE', '') || read('QTCAAC_ASSET_BASE', '');
	return v.trim().replace(/\/+$/, '');
}

/** Public site URL (PUBLIC_BASE_URL) without a trailing slash. */
export function runtimePublicBaseUrl(): string {
	return read('PUBLIC_BASE_URL', '').trim().replace(/\/+$/, '');
}
