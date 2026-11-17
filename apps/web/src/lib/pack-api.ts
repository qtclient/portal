/**
 * Pack API — the only surface a product pack (`QTCAAC_PACK`) may implement.
 *
 * A pack provides any of these modules under `web/lib/` (copied to
 * `src/lib/pack/` by `scripts/pack.mjs`); missing modules fall back to
 * `src/lib/pack-default/`:
 *
 * - `config.ts`        — `export default defineConfig({...})` (branding, client brand, hosts)
 * - `hooks.server.ts`  — `export const hooks: PackServerHooks = {...}`
 * - `play.client.ts`   — `export function playEnv(): Record<string, string>`
 *
 * Packs may also ship `web/routes/**` (mounted at `src/routes/(app)/(pack)/`,
 * inside the site layout),
 * `web/static/**` (served at `/pack/…`), `web/content/*` (events/news),
 * `web/prisma/schema/*.prisma` and `web/prisma/migrations/<ts>_pack_<name>/`.
 */
import type { Handle } from '@sveltejs/kit/hooks';

/** Qt identity the WASM/desktop tip was built with (launcher `brand.json`). */
export type ClientBrand = {
	/** Display name (launcher `productName`). */
	name: string;
	/** Qt organization name (launcher `productOrg`). */
	org: string;
	/** Pack id staged under tip `mods/<id>/` for /play, or null for a stock tip. */
	packId: string | null;
};

export type SiteBrand = {
	/** Header logo URL (pack static files live under `/pack/`). Null = text title. */
	logo: string | null;
	/** Small square mark (e-mails, compact header). */
	logoMark: string | null;
	favicon: string;
	/** Page background image; null = theme gradient. */
	background: string | null;
	/** PWA icons for /play. */
	icons: { src: string; sizes: string; purpose?: string }[];
	appleTouchIcon: string | null;
	/** One-line description on the About page; null = generic text. */
	tagline: string | null;
};

export type PackConfig = {
	site?: Partial<SiteBrand>;
	client?: Partial<ClientBrand>;
	/**
	 * Hostnames the stock client should be remapped to (CIP `www.tibia.com`
	 * etc.). Defaults derive from PUBLIC_BASE_URL / asset base at runtime.
	 */
	hosts?: { www?: string; static?: string; payments?: string };
};

export type ResolvedPackConfig = {
	site: SiteBrand;
	client: ClientBrand;
	hosts: { www?: string; static?: string; payments?: string };
};

export function defineConfig(config: PackConfig): PackConfig {
	return config;
}

export const DEFAULT_SITE: SiteBrand = {
	logo: null,
	logoMark: null,
	favicon: '/favicon.svg',
	background: null,
	icons: [{ src: '/favicon.svg', sizes: 'any' }],
	appleTouchIcon: null,
	tagline: null,
};

/** Stock qtclient tip identity (CIP names). */
export const DEFAULT_CLIENT: ClientBrand = {
	name: 'Tibia',
	org: 'Tibia',
	packId: null,
};

export function resolvePackConfig(config: PackConfig): ResolvedPackConfig {
	return {
		site: { ...DEFAULT_SITE, ...config.site },
		client: { ...DEFAULT_CLIENT, ...config.client },
		hosts: { ...config.hosts },
	};
}

/** Context passed to clientservices hooks. */
export type ClientServicesContext = { request: Request };

/**
 * Server hooks. Every hook is optional; returning `undefined` keeps the core
 * behavior.
 */
export type PackServerHooks = {
	/** Runs before the core SvelteKit `handle` (sequence order: pack → core). */
	handle?: Handle;
	/** Mutate/extend the CIP login JSON before it is returned. */
	loginResponse?: (
		response: Record<string, unknown>,
		ctx: ClientServicesContext & { accountId: number },
	) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
	/** Replace the clientservices `showoff` payload. */
	showoff?: (
		ctx: ClientServicesContext,
	) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>;
	/** Extra telemetry sink (Sentry, OTLP, …); called after the DB write. */
	telemetry?: (event: TelemetryEvent) => void | Promise<void>;
};

export type TelemetryEvent =
	| {
			kind: 'crash';
			id: string;
			platform: string;
			revision: string;
			signature: string;
			reportType: string;
			comment: string | null;
	  }
	| {
			kind: 'fps';
			platform: string;
			revision: string;
			renderer: string;
			averageFps: number;
			minFps: number;
			maxFps: number;
	  };
