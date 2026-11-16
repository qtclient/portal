# Assets

qtc-aac ships no game art. Sprites, store images and the browser client come
from a **qtclient CDN tip** — the static tree qtclient publishes (same layout
as the official static host). Set its origin in `QTCAAC_ASSET_BASE`.

| Tip path | Used by |
|----------|---------|
| `assets/items/manifest.json` → `{ "revision", "path" }` | `/api/items` |
| `assets/items/<rev>/<client id>.png`, `names.json` | item sprites + names |
| `assets/outfits/manifest.json`, `assets/outfits/<rev>/<looktype>/…` | `/api/outfits` (animated outfits) |
| `images/store/{13,32,64,home}/…` | store images (`/images/store/*` redirects here) |
| `latest/release.json`, `latest/desktop.json` | client revision gate, `/download` |
| `launcher/*-web-current/`, `client/<rev>/wasm/` | `/play` |

qtc-aac caches the slices it uses under `apps/web/items` and
`apps/web/outfits_anim`, and resets the cache when a slice revision changes.

The slices are rendered from the official client assets by qtclient
(`make -C qtclient publish-assets`); see the qtclient repository.

## Without a qtclient tip

Item and outfit images can come from any MyAAC-compatible host instead:

```bash
QTCAAC_ITEM_IMAGES_URL=https://item-images.example/latest/   # <url><id><ext>
QTCAAC_ITEM_IMAGES_EXT=.gif
QTCAAC_OUTFIT_IMAGES_URL=https://outfit-images.example/outfit.php
```

`/play`, store images and item names still need a tip.
