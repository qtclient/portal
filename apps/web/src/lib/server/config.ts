import * as privateEnv from '$app/env/private';

const REQUIRE_EMAIL_CONFIRMATION_TO_LOGIN =
	privateEnv.REQUIRE_EMAIL_CONFIRMATION_TO_LOGIN ?? '';

export const requireEmailVerification =
	REQUIRE_EMAIL_CONFIRMATION_TO_LOGIN === 'true';
