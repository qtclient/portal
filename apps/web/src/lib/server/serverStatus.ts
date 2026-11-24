import { check as checkPort } from 'tcp-port-used';

import { PlayerGroup } from '#lib/players.js';
import { prisma } from '#lib/server/prisma.js';
import {
	runtimeStatusAddress,
	runtimeStatusPort,
} from '#lib/server/runtimeEnv.js';

/** Probe Crystal's status port — not the game port (avoids ProtocolGame connect noise). */
function statusProbePort(): number {
	const n = Number(runtimeStatusPort());
	return Number.isFinite(n) && n > 0 ? n : 7173;
}

export async function serverStatus(): Promise<{
	serverOnline: boolean;
	onlinePlayerCount: number;
}> {
	let serverOnline = false;
	try {
		serverOnline = await checkPort(statusProbePort(), runtimeStatusAddress());
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
