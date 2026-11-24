import { prisma } from '#lib/server/prisma.js';
import {
	runtimePvpType,
	runtimeServerAddress,
	runtimeServerName,
	runtimeServerPort,
	runtimeStatusPort,
} from '#lib/server/runtimeEnv.js';

export type GameWorldRow = {
	id: number;
	name: string;
	type: string;
	location: string;
	ip: string;
	port: number;
	port_status: number;
};

const PVP_TYPE_MAP: Record<string, number> = {
	pvp: 0,
	'no-pvp': 1,
	'pvp-enforced': 2,
};

export function pvpTypeFromWorldType(type: string): number {
	return PVP_TYPE_MAP[type] ?? PVP_TYPE_MAP[runtimePvpType()] ?? 0;
}

export function locationCode(location: string): string {
	switch (location) {
		case 'Europe':
			return 'EUR';
		case 'North America':
			return 'USA';
		case 'South America':
			return 'BRA';
		case 'Oceania':
			return 'OCA';
		default:
			return 'USA';
	}
}

/**
 * CipSoft world list — `worlds` table is the only source of truth for CipSoft
 * login `playdata.worlds` (name, endpoints). SERVER_NAME is bootstrap-only when
 * the table is empty; it must match the primary world row Crystal will seed.
 */
export async function listGameWorlds(): Promise<GameWorldRow[]> {
	try {
		const rows = await prisma.worlds.findMany({
			orderBy: { id: 'asc' },
		});
		if (rows.length > 0) {
			return rows.map((world) => ({
				id: world.id,
				name: world.name,
				type: world.type,
				location: world.location,
				ip: world.ip,
				port: world.port,
				port_status: world.port_status,
			}));
		}
	} catch (error) {
		console.warn(
			'worlds table unavailable; CipSoft login falling back to SERVER_NAME seed',
			error,
		);
	}

	const gamePort = parseInt(runtimeServerPort(), 10) || 7171;
	return [
		{
			id: 1,
			name: runtimeServerName(),
			type: runtimePvpType(),
			location: 'South America',
			ip: runtimeServerAddress() || '127.0.0.1',
			port: gamePort,
			port_status: parseInt(runtimeStatusPort(), 10) || 7173,
		},
	];
}
