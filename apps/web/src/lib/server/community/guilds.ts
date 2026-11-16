import { dbToPlayer, PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';

export async function loadGuilds(searchParams: URLSearchParams) {
	const search = searchParams.get('search');

	const guilds = await prisma.guilds.findMany({
		where: {
			name: {
				...(search ? { contains: search } : {}),
				not: { contains: '~~' },
			},
		},
		select: {
			name: true,
			image_url: true,
			description: true,
			guild_membership: { select: { player: { select: { online: true } } } },
			owner: { select: PlayerSelectForList },
		},
	});

	return {
		title: 'Guilds',
		results: guilds.map((guild) => ({
			name: guild.name,
			image_url: guild.image_url,
			description: guild.description,
			members: guild.guild_membership.length,
			onlineMembers: guild.guild_membership.filter((m) => m.player.online)
				.length,
			leader: dbToPlayer(guild.owner),
		})),
	};
}
