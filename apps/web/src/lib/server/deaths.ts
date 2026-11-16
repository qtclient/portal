import { prisma } from '#lib/server/prisma.js';

export type LastKillEntry = {
	victimName: string;
	victimLink: string;
	level: number;
	time: bigint;
	killedBy: string;
	killedByLink: string | null;
	isPlayerKill: boolean;
	mostDamageBy: string;
	mostDamageLink: string | null;
	mostDamageIsPlayer: boolean;
	unjustified: boolean;
	mostDamageUnjustified: boolean;
};

const DEFAULT_LIMIT = 50;

export async function listRecentDeaths(
	limit = DEFAULT_LIMIT,
): Promise<LastKillEntry[]> {
	const deaths = await prisma.playerDeaths.findMany({
		orderBy: { time: 'desc' },
		take: limit,
		include: {
			players: {
				select: { name: true, deletion: true },
			},
		},
	});

	return deaths
		.filter((death) => death.players.deletion === BigInt(0))
		.map((death) => ({
			victimName: death.players.name,
			victimLink: `/characters/${encodeURIComponent(death.players.name)}`,
			level: death.level,
			time: death.time,
			killedBy: death.killed_by,
			killedByLink: death.is_player
				? `/characters/${encodeURIComponent(death.killed_by)}`
				: null,
			isPlayerKill: death.is_player,
			mostDamageBy: death.mostdamage_by,
			mostDamageLink: death.mostdamage_is_player
				? `/characters/${encodeURIComponent(death.mostdamage_by)}`
				: null,
			mostDamageIsPlayer: death.mostdamage_is_player,
			unjustified: death.unjustified,
			mostDamageUnjustified: death.mostdamage_unjustified,
		}));
}
