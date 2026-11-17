# Product packs

A pack customizes qtc-aac without forking it. It is a directory with a `web/`
tree; `scripts/pack.mjs` copies it into `apps/web` before a build or dev run.

```text
my-pack/web/
  lib/config.ts            branding, client identity, hostnames
  lib/hooks.server.ts      server hooks
  lib/play.client.ts       extra env for the /play WASM client
  lib/<dir>/…              helpers imported by the three modules above
  routes/**                extra pages (inside the site layout)
  static/**                served at /pack/…
  content/events.json      event calendar (clientservices eventschedule)
  content/news.json        default Compendium news
  prisma/schema/*.prisma   extra Prisma models
  prisma/migrations/<YYYYMMDDHHMMSS>_pack_<name>/migration.sql
```

Anything else under `web/` is rejected, so a pack can never replace core files.
Every module is optional; missing ones fall back to `apps/web/src/lib/pack-default`.

## Applying

| Command | Effect |
|---------|--------|
| `QTCAAC_PACK=../my-pack make run` | apply, re-apply on change, dev server |
| `QTCAAC_PACK=../my-pack make build` | apply, production build |
| `make pack-check QTCAAC_PACK=../my-pack` | validate only |
| `make pack-clean` | remove an applied pack |
| `docker build … --build-context pack=../my-pack .` | apply inside the image build |

Applied files are gitignored; never commit them to the core.

## Config (`lib/config.ts`)

```ts
import { defineConfig } from '#lib/pack-api.js';

export default defineConfig({
	site: {
		logo: '/pack/brand/logo.png',      // null → text title
		logoMark: '/pack/brand/mark.png',  // e-mails
		favicon: '/pack/brand/favicon.png',
		background: '/pack/brand/bg.jpg',  // null → gradient
		icons: [{ src: '/pack/brand/icon-192.png', sizes: '192x192' }],
		appleTouchIcon: '/pack/brand/apple-touch-icon.png',
		tagline: 'One line for the About page.',
	},
	// Must match how your qtclient tip was branded (launcher brand.json).
	client: { name: 'MyServer', org: 'MyServer', packId: 'myserver' },
	hosts: { www: 'www.example.com', static: 'static.example.com' },
});
```

`client.packId` is the tip pack id (`mods/<id>/` inside the web client and
launcher packages, as next to the desktop binary; null for a stock tip). Browser storage is namespaced by it, so keep it stable.

## Hooks (`lib/hooks.server.ts`)

```ts
import type { PackServerHooks } from '#lib/pack-api.js';

export const hooks: PackServerHooks = {
	handle: async ({ event, resolve }) => resolve(event),     // runs before the core handle
	loginResponse: (response, { accountId }) => response,     // extend CIP login JSON
	showoff: () => undefined,                                 // replace clientservices showoff
	telemetry: (event) => {},                                 // forward crashes / FPS elsewhere
};
```

Returning `undefined` keeps the core behavior.

## Migrations

Pack migrations share Prisma's migration history with the core and run in
timestamp order. Make them idempotent (`CREATE TABLE IF NOT EXISTS`, guarded
`ALTER`s) and name them `<14-digit timestamp>_pack_<name>`.
