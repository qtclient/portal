import { PlayerGroup, type PlayerWithRank, vocationIds } from '#lib/players.js';
import { dbToPlayer, PlayerSelectForList } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { isSkill, skillToColumn } from '#lib/server/skills.js';

const PER_PAGE = 50;
const MAX_PER_PAGE = 200;

export async function loadHighscores(searchParams: URLSearchParams) {
	const skillParam = searchParams.get('skill');
	const skill = isSkill(skillParam) ? skillParam : 'experience';
	const vocation = searchParams.get('vocation') ?? 'all';

	let take = Number(searchParams.get('limit')) || PER_PAGE;
	if (take > MAX_PER_PAGE) {
		take = MAX_PER_PAGE;
	}
	const page = Number(searchParams.get('page')) || 1;
	const skip = page * take - take;
	const skillColumn = skillToColumn(skill);

	const characters = await prisma.players.findMany({
		where: {
			deletion: 0,
			group_id: {
				lt: PlayerGroup.Gamemaster,
			},
			vocation:
				vocation === 'all'
					? undefined
					: {
							in: vocationIds(vocation),
						},
		},
		select: PlayerSelectForList,
		orderBy: { [skillColumn]: 'desc' },
		take,
		skip,
	});
	const count = await prisma.players.count({
		where: {
			group_id: {
				lt: PlayerGroup.Gamemaster,
			},
		},
	});

	return {
		title: 'Highscores',
		characters: characters
			.map(dbToPlayer)
			.map((player, index): PlayerWithRank => ({
				...player,
				rank: skip + index + 1,
				skill: characters[index][skillColumn].toLocaleString(undefined),
			})),
		page,
		limit: take,
		offset: page - 1,
		skill,
		count,
		vocation,
	};
}
