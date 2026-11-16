import * as publicEnv from '$app/env/public';

const PUBLIC_ENABLE_PRONOUNS = publicEnv.PUBLIC_ENABLE_PRONOUNS ?? '';
const PUBLIC_TUTORIAL_ENABLED = String(publicEnv.PUBLIC_TUTORIAL_ENABLED ?? '')
	.trim()
	.toLowerCase();

export const pronounsEnabled = PUBLIC_ENABLE_PRONOUNS === 'true';
/** Match create-account `playTutorialEnabled` (true / 1 / on). */
export const tutorialEnabled =
	PUBLIC_TUTORIAL_ENABLED === 'true' ||
	PUBLIC_TUTORIAL_ENABLED === '1' ||
	PUBLIC_TUTORIAL_ENABLED === 'on';
