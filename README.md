# qtc-aac

Website, account manager (AAC) and client services for
[qtclient](https://github.com/qtclient/qtclient) servers.

- **Website + AAC** — accounts, characters, guilds, houses, highscores, news,
  Char Bazaar, referrals, admin panel.
- **Client services** — the HTTP API the client talks to: login, client
  services (news, events, boosted creature, showoff), account creation.
- **Browser play** — `/play` boots the qtclient WebAssembly build from a
  qtclient CDN tip.
- **Telemetry** — crash reports (Breakpad minidumps and browser errors) with
  server-side symbolication, FPS history and system surveys, with admin views.
- **Product packs** — brand it and add routes, hooks, content and migrations
  without forking the core.

Runs on [SvelteKit](https://svelte.dev/docs/kit) + [Bun](https://bun.sh) with
Prisma on MariaDB/MySQL. Targets the
[CrystalServer](https://github.com/zimbadev/crystalserver) schema.

## Quick start

```bash
make setup                     # bun install, apps/web/.env, prisma generate
# edit apps/web/.env: DATABASE_URL, PUBLIC_TITLE, QTCAAC_ASSET_BASE, …
make migrate                   # web tables on top of the game schema
make run                       # http://127.0.0.1:5173
```

The game server must have imported its `schema.sql` first. Docker:

```bash
docker build -f apps/web/Dockerfile -t qtc-aac .
docker run -p 3000:3000 -e DATABASE_URL=mysql://… -v qtc-aac-data:/app/data qtc-aac
```

The image entrypoint waits for the database, applies migrations (baselining an
existing database on first boot) and starts the server.

## Assets

Sprites and the browser client come from a **qtclient CDN tip**
(`QTCAAC_ASSET_BASE`) — see [docs/assets.md](docs/assets.md). Without one,
point `QTCAAC_ITEM_IMAGES_URL` / `QTCAAC_OUTFIT_IMAGES_URL` at any
MyAAC-compatible image host.

## Packs

A pack is a directory with a `web/` tree that is applied on top of the core at
build time:

```bash
QTCAAC_PACK=../my-pack make run          # applies + watches the pack
docker build -f apps/web/Dockerfile --build-context pack=../my-pack .
```

See [docs/packs.md](docs/packs.md) and the working example in
[`examples/pack`](examples/pack).

## Telemetry

The client's crash reporter and FPS uploader post to
`/clientservices/crashreceiver.php` and `/clientservices/hardwarereceiver.php`;
`/play` reports browser crashes to `/api/telemetry/crash`. CI uploads debug
symbols to `/api/telemetry/symbols`. See [docs/telemetry.md](docs/telemetry.md)
and [PRIVACY.md](PRIVACY.md).

## Development

```bash
make check      # svelte-check
make test       # unit tests
make build      # production build (applies QTCAAC_PACK when set)
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE). Fonts under `apps/web/static/fonts` are SIL OFL
1.1 (license texts alongside).
