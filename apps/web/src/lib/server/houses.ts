import type { Houses, Towns } from '@prisma/client';

import { prisma } from '#lib/server/prisma.js';

export type HouseListItem = {
	id: number;
	name: string;
	size: number;
	rent: number;
	townId: number;
	townName: string;
	ownerLabel: string;
	ownerLink: string | null;
	isFree: boolean;
};

export type HouseDetail = HouseListItem & {
	beds: number;
	paidUntil: Date | null;
	warnings: number;
};

type HouseOrder = 'name' | 'size' | 'rent';

export async function listTownsForHouses(): Promise<
	Pick<Towns, 'id' | 'name'>[]
> {
	const towns = await prisma.towns.findMany({
		select: { id: true, name: true },
		orderBy: { name: 'asc' },
	});
	return towns.length > 0 ? towns : [{ id: 0, name: 'All towns' }];
}

export async function listHouses(options: {
	townId?: number;
	freeOnly?: boolean;
	order?: HouseOrder;
}): Promise<HouseListItem[]> {
	const order = options.order ?? 'name';
	const where: {
		town_id?: number;
		owner?: number;
	} = {};

	if (options.townId !== undefined && options.townId > 0) {
		where.town_id = options.townId;
	}
	if (options.freeOnly) {
		where.owner = 0;
	}

	const houses = await prisma.houses.findMany({
		where: {
			...where,
			world_id: 1,
		},
		orderBy: { [order]: 'asc' },
	});

	const townIds = [...new Set(houses.map((h) => h.town_id))];
	const towns = await prisma.towns.findMany({
		where: { id: { in: townIds } },
		select: { id: true, name: true },
	});
	const townById = new Map(towns.map((t) => [t.id, t.name]));

	const ownerIds = houses
		.filter((h) => h.owner > 0 && !h.guildid)
		.map((h) => h.owner);
	const owners = await prisma.players.findMany({
		where: { id: { in: ownerIds } },
		select: { id: true, name: true },
	});
	const ownerById = new Map(owners.map((p) => [p.id, p.name]));

	const guildOwnerIds = houses
		.filter((h) => h.guildid && h.owner > 0)
		.map((h) => h.owner);
	const guilds = guildOwnerIds.length
		? await prisma.guilds.findMany({
				where: { id: { in: guildOwnerIds } },
				select: { id: true, name: true },
			})
		: [];
	const guildById = new Map(guilds.map((g) => [g.id, g.name]));

	return houses.map((house) =>
		toHouseListItem(house, townById, ownerById, guildById),
	);
}

export async function getHouseByNameOrId(
	nameOrId: string,
): Promise<HouseDetail | null> {
	const numericId = Number(nameOrId);
	const house = await prisma.houses.findFirst({
		where:
			Number.isFinite(numericId) && numericId > 0
				? { id: numericId, world_id: 1 }
				: { name: nameOrId, world_id: 1 },
	});

	if (!house) {
		return null;
	}

	const town = await prisma.towns.findUnique({
		where: { id: house.town_id },
		select: { name: true },
	});
	const townById = new Map([[house.town_id, town?.name ?? 'Unknown']]);

	const ownerById = new Map<number, string>();
	const guildById = new Map<number, string>();

	if (house.owner > 0 && house.guildid) {
		const guild = await prisma.guilds.findUnique({
			where: { id: house.owner },
			select: { name: true },
		});
		if (guild) {
			guildById.set(house.owner, guild.name);
		}
	} else if (house.owner > 0) {
		const player = await prisma.players.findUnique({
			where: { id: house.owner },
			select: { name: true },
		});
		if (player) {
			ownerById.set(house.owner, player.name);
		}
	}

	const base = toHouseListItem(house, townById, ownerById, guildById);
	return {
		...base,
		beds: house.beds,
		paidUntil: house.paid > 0 ? new Date(house.paid * 1000) : null,
		warnings: house.warnings,
	};
}

function toHouseListItem(
	house: Houses,
	townById: Map<number, string>,
	ownerById: Map<number, string>,
	guildById: Map<number, string>,
): HouseListItem {
	const isFree = house.owner === 0;
	let ownerLabel = 'Free';
	let ownerLink: string | null = null;

	if (!isFree && house.guildid && guildById.has(house.owner)) {
		const guildName = guildById.get(house.owner)!;
		ownerLabel = `Guild: ${guildName}`;
		ownerLink = `/guilds/${encodeURIComponent(guildName)}`;
	} else if (!isFree && ownerById.has(house.owner)) {
		const playerName = ownerById.get(house.owner)!;
		ownerLabel = playerName;
		ownerLink = `/characters/${encodeURIComponent(playerName)}`;
	} else if (!isFree) {
		ownerLabel = 'Unknown';
	}

	return {
		id: house.id,
		name: house.name,
		size: house.size,
		rent: house.rent,
		townId: house.town_id,
		townName: townById.get(house.town_id) ?? 'Unknown',
		ownerLabel,
		ownerLink,
		isFree,
	};
}
