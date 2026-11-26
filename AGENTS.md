# AGENTS.md

Guidance for coding agents working in **qtclient/portal** (OSS web Host).

## Layout

| Path | Role |
|------|------|
| `apps/web` | SvelteKit app (`@qtc-aac/web`): site, AAC, admin, clientservices, `/play`, telemetry |
| `apps/cdn` | Base CDN tip image / nginx config (SoT for `ghcr.io/idleot/cdn:runtime-*`) |
| `apps/web/src/lib/server/telemetry` | crash / FPS ingest, symbolication, retention |
| `apps/web/src/lib/pack-api.ts` | the only surface packs implement |
| `apps/web/src/lib/pack-default` | fallbacks for missing pack modules |
| `apps/web/prisma/schema`, `prisma/migrations` | Prisma models + idempotent SQL migrations |
| `apps/web/content` | default event calendar / news |
| `packages/auth-client`, `packages/ui` | shared login client and Svelte components |
| `scripts/pack.mjs` | pack apply / watch / check / clean |
| `examples/pack` | reference pack (CI builds with it) |

## Rules

- Imports use `#lib/*` (package subpath imports); `$lib` does not exist in Kit 3.
  Pack modules are imported as `$pack/config`, `$pack/hooks.server`, `$pack/play.client`.
- Never add product branding, hostnames or content to the core. Make it a pack
  config field or hook with a neutral default instead.
- Never commit game art or client binaries. Assets come from a qtclient Dist /
  CDN release.
- Env is runtime-only: declare variables in `apps/web/src/env.ts`, read them via
  `$app/env/*` or `process.env` at call time — never bake config into the image.
- Migrations must be idempotent (`IF NOT EXISTS`, the `Add*IfNotExists`
  procedures): the entrypoint baselines existing databases by re-running them.
- External `redirect()` targets need `{ external: true }`; never pass
  user-controlled URLs there.
- Client HTTP endpoints keep CipSoft paths (`/clientservices/*.php`). Website
  links are extensionless.

## Checks

```bash
make check   # svelte-check (0 errors expected)
make test    # unit tests
make build
QTCAAC_PACK=examples/pack make build
```
