import { defineEnvVars } from '@sveltejs/kit/env';

/*
 * Every variable is runtime (`static` must stay false): the image is built
 * without a `.env` and Coolify injects config when the container starts.
 */
const optional = (value: string | undefined) => value;

const privateVar = (description: string) => ({ schema: optional, description });
const publicVar = (description: string) => ({
	public: true,
	schema: optional,
	description,
});

export const variables = defineEnvVars({
	PUBLIC_TITLE: publicVar('Site title'),
	PUBLIC_BASE_URL: publicVar('Public site URL'),
	PUBLIC_DOWNLOAD_URL: publicVar('Client download page URL'),
	PUBLIC_PAYMENTS_URL: publicVar('Payments / shop app URL'),
	PUBLIC_SUPPORT_EMAIL: publicVar('Support e-mail address'),
	PUBLIC_DISCORD_URL: publicVar('Discord invite URL'),
	PUBLIC_INSTAGRAM_URL: publicVar('Instagram URL'),
	PUBLIC_WHATSAPP_URL: publicVar('WhatsApp URL'),
	PUBLIC_WIKI_URL: publicVar('Wiki URL'),
	PUBLIC_ENABLE_PRONOUNS: publicVar('"true" enables character pronouns'),
	PUBLIC_TUTORIAL_ENABLED: publicVar('"true" enables the tutorial island'),
	PUBLIC_STRIPE_KEY: publicVar('Stripe publishable key'),

	SERVER_NAME: privateVar('Game world name'),
	SERVER_SAVE_TIME: privateVar('Daily server save time (HH:mm)'),
	GAME_SESSION_EXPIRATION_TIME: privateVar('Game session lifetime in seconds'),
	FREE_PREMIUM: privateVar('"true" grants premium to every account'),
	AUTO_ADMIN_EMAIL: privateVar('Account e-mail promoted to admin on login'),
	REQUIRE_EMAIL_CONFIRMATION_TO_LOGIN: privateVar(
		'"true" blocks login until e-mail is confirmed',
	),
	ALLOW_LEGACY_SHA1_PASSWORDS: privateVar(
		'"true" accepts legacy SHA1 password hashes',
	),
	DEPRECATED_USE_SHA1_PASSWORDS: privateVar(
		'"true" stores new passwords as SHA1',
	),
	NO_REPLY_EMAIL: privateVar('From address for transactional e-mail'),
	EMAIL_BACKGROUND_COLOR: privateVar('E-mail template background color'),
	EMAIL_BUTTON_COLOR: privateVar('E-mail template button color'),
	EMAIL_BUTTON_TEXT: privateVar('E-mail template button text color'),
	SMTP_SERVER: privateVar('SMTP host'),
	SMTP_PORT: privateVar('SMTP port'),
	SMTP_USER: privateVar('SMTP user'),
	SMTP_PASSWORD: privateVar('SMTP password'),
	ENABLE_STRIPE_CHECKOUT: privateVar('"true" enables Stripe Checkout'),
	ENABLE_STRIPE_CUSTOM: privateVar('"true" enables Stripe Elements payments'),
	SECRET_STRIPE_KEY: privateVar('Stripe secret key'),
	STRIPE_WEBHOOK_SECRET: privateVar('Stripe webhook signing secret'),
});
