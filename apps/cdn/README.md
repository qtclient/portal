# Portal CDN (base)

Source of truth for the thin **CDN** runtime image (`ghcr.io/idleot/cdn:runtime-*`):
nginx + tip config only. Site blobs live on the deploy host volume and are
assembled/promoted by `idleot/release`.

| File | Role |
|------|------|
| `Dockerfile` | `nginx:1.27-alpine` + this `nginx.conf` |
| `nginx.conf` | Tip host config (CIP launcher paths, WASM, healthz) |

## Consumers

| Consumer | How |
|----------|-----|
| `idleot/release` `bundle.yml` | Checks out this directory and builds/pushes the runtime image |
| Umbrella `docker-compose.yml` (`make infra`) | Bind-mounts `nginx.conf` for local tip `:9080` |
| Deploy stack | Pulls `ghcr.io/idleot/cdn` (image built from here) |

IdleOT-only store art comes from the Web Mod (`idleot/portal` `assets/images/store`)
at publish time — not from this Host tree.
