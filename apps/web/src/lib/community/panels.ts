export const PLAY_COMMUNITY_PANELS = [
	{ id: 'highscores', labelKey: 'highscores' },
	{ id: 'last-kills', labelKey: 'last-kills.title' },
	{ id: 'characters', labelKey: 'characters' },
] as const;

/** `online` is opened from the top-bar status pill, not the community nav. */
export type CommunityPanelId =
	(typeof PLAY_COMMUNITY_PANELS)[number]['id'] | 'online';

export type CommunityPanelContext = 'page' | 'overlay';

const COMMUNITY_PANEL_IDS = new Set<string>([
	...PLAY_COMMUNITY_PANELS.map((panel) => panel.id),
	'online',
]);

export function isCommunityPanelId(value: string): value is CommunityPanelId {
	return COMMUNITY_PANEL_IDS.has(value);
}
