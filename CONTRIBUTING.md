# Contributing

Thanks for helping! A few ground rules keep qtc-aac usable for every server:

1. **Keep the core neutral.** Server-specific branding, content and behavior
   belong in a pack (`docs/packs.md`). If a pack needs something the API does
   not offer, propose a new config field or hook.
2. **No game assets or client binaries** in pull requests.
3. **Migrations are idempotent** and never rewrite an existing migration.
4. Run `make check`, `make test` and `make build` before opening a PR.
   Changes to `scripts/pack.mjs` or `pack-api.ts` should also pass
   `QTCAAC_PACK=examples/pack make build`.

Use conventional commit prefixes (`feat:`, `fix:`, `docs:`, …). Report
security issues privately — see [SECURITY.md](SECURITY.md).
