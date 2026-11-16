import { PlayerGroup } from '#lib/players.js';
import { dbToPlayer, PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';

export type StaffMember = ReturnType<typeof dbToPlayer> & {
	groupId: number;
	groupName: string;
	lastLogin: Date | null;
};

const GROUP_LABELS: Record<number, string> = {
	[PlayerGroup.Tutor]: 'Tutor',
	[PlayerGroup.Seniortutor]: 'Senior Tutor',
	[PlayerGroup.Gamemaster]: 'Gamemaster',
	[PlayerGroup.Communitymanager]: 'Community Manager',
	[PlayerGroup.God]: 'God',
};

export async function listStaffMembers(): Promise<StaffMember[]> {
	const players = await prisma.players.findMany({
		where: {
			group_id: { gte: PlayerGroup.Tutor },
			deletion: 0,
		},
		select: {
			...PlayerSelectForList,
			group_id: true,
			lastlogin: true,
		},
		orderBy: [{ group_id: 'desc' }, { name: 'asc' }],
	});

	return players.map((player) => ({
		...dbToPlayer(player),
		groupId: player.group_id,
		groupName: GROUP_LABELS[player.group_id] ?? `Group ${player.group_id}`,
		lastLogin:
			player.lastlogin > 0 ? new Date(Number(player.lastlogin) * 1000) : null,
	}));
}

export function groupStaffByRole(
	staff: StaffMember[],
): Map<string, StaffMember[]> {
	const grouped = new Map<string, StaffMember[]>();
	for (const member of staff) {
		const list = grouped.get(member.groupName) ?? [];
		list.push(member);
		grouped.set(member.groupName, list);
	}
	return grouped;
}
