import { pack } from '#lib/pack.js';
import { runtimeAssetBase } from '#lib/server/runtimeEnv.js';

/**
 * Official client hostnames → this deployment's origins (paths stay the same).
 */

export type HostRole = 'portal' | 'cdn' | 'portal-stub';

export interface HostMapping {
	/** Hostname as used by the stock client. */
	sourceHost: string;
	role: HostRole;
	/** Host for this deployment (override via env / DNS locally). */
	targetHost: string;
	notes: string;
}

function hostOf(url: string | undefined): string {
	if (!url) return '';
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
}

/**
 * Stock-client hosts and where this deployment serves them. Targets come from
 * the pack config (`hosts`) or the runtime URLs (PUBLIC_BASE_URL, asset base,
 * PUBLIC_PAYMENTS_URL).
 */
export function hostMap(): readonly HostMapping[] {
	const www = pack.hosts.www || hostOf(process.env.PUBLIC_BASE_URL) || 'localhost';
	const cdn = pack.hosts.static || hostOf(runtimeAssetBase()) || www;
	const payments =
		pack.hosts.payments || hostOf(process.env.PUBLIC_PAYMENTS_URL) || www;
	return [
		{ sourceHost: 'www.tibia.com', role: 'portal', targetHost: www, notes: 'website + clientservices' },
		{ sourceHost: 'static.tibia.com', role: 'cdn', targetHost: cdn, notes: 'static assets / launcher tip' },
		{ sourceHost: 'limesurvey.cipsoft.com', role: 'portal-stub', targetHost: www, notes: 'survey stub' },
		{ sourceHost: 'www.cipsoft.com', role: 'portal-stub', targetHost: www, notes: 'corporate link stub' },
		{ sourceHost: 'payments.cipsoft.com', role: 'portal', targetHost: payments, notes: 'coin webshop' },
	];
}

/** Client HTTP API paths (stock client expects these, including `.php`). */
export const CLIENTSERVICES_PATHS = {
	login: '/clientservices/loginservice.php',
	clientservices: '/clientservices/clientservices.php',
	accountCreation: '/clientservices/accountcreationclientservices.php',
	recaptchaV2: '/clientservices/recaptcha_v2_content.php',
	recaptchaV3: '/clientservices/recaptcha_v3_content.php',
	crash: '/clientservices/crashreceiver.php',
	hardware: '/clientservices/hardwarereceiver.php',
	tutorial: '/clientservices/tutorialprogress.php',
} as const;
