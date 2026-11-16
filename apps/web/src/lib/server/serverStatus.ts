import { check as checkPort } from 'tcp-port-used';

import { PlayerGroup } from '#lib/players.js';
import { prisma } from '#lib/server/prisma.js';
import { runtimeServerAddress } from '#lib/server/runtimeEnv.js';

/** Probe status/login port — not gameProtocolPort (avoids ProtocolGame connect noise). */
function statusProbePort(): number {
	const raw = process.env.STATUS_PORT || process.env.LOGIN_PORT || '7171';
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : 7171;
}

export async function serverStatus(): Promise<{
	serverOnline: boolean;
	onlinePlayerCount: number;
}> {
	let serverOnline = false;
	try {
		serverOnline = await checkPort(statusProbePort(), runtimeServerAddress());
	} catch {
		serverOnline = false;
	}
	let onlinePlayerCount = 0;
	try {
		onlinePlayerCount = await prisma.playerOnline.count({
			where: { player: { group_id: { lt: PlayerGroup.Gamemaster } } },
		});
	} catch {
		// DB may be down during local boot — still report TCP probe result.
	}
	return { serverOnline, onlinePlayerCount };
}
