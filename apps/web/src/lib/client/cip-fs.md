# CIP package FS layout (desktop + browser)

CipSoft AppData root is Qt `QStandardPaths::AppDataLocation` after the tip's org/app
names (`<Org>` / `<App>`, pack `client.org` / `client.name`) — one API for every OS (no hardcoded Application Support /
AppData / `.local/share` in C++).

| Surface                           | CipSoft AppData root                                         | Client package                     | Launcher                                    |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------- |
| macOS                             | `~/Library/Application Support/<Org>/<App>/`                 | `packages/<PACKAGE_CLIENT>/`       | `/Applications/<App>.app` (bootstrap only)   |
| Windows                           | `%APPDATA%\<Org>\<App>\`                                     | `packages/<PACKAGE_CLIENT>/`       | installer `<App>.exe`                       |
| Linux                             | `~/.local/share/<Org>/<App>/`                                | `packages/<PACKAGE_CLIENT>/`       | AppImage / binary                           |
| Browser OPFS                      | `/home/web_user/.local/share/<Org>/<App>/` (`CIP_APPDATA`)   | `packages/<PACKAGE_CLIENT>/`       | CipSoft UI stage inside `tibia.wasm`        |
| Browser IndexedDB `<brand>-cip-fs` | key prefix `packages/`                                       | `packages/<PACKAGE_CLIENT>/<file>` | (engine wasm/js bootstrap only)             |

Emscripten **home** / OPFS tip is `/home/web_user` (`CIP_HOME`). CipSoft
AppData is the XDG path under that home (same formula as Linux desktop) —
packages do **not** live directly under HOME.

`PACKAGE_CLIENT` (portal) / `CLIENT_PACKAGE_DIR` (cip_package) /
`kClientPackageDir` (launcher C++) is the tip `directoryname` — CipSoft uses
`Tibia.app`; a pack sets its own (`client.packageDir`). CipSoft Play executable basename inside
the package is **`client`** (`Contents/MacOS/client`).

Under CipSoft AppData:

```text
<AppDataLocation>/
  packages/<PACKAGE_CLIENT>/Contents/MacOS/client
  packages/<PACKAGE_CLIENT>/Contents/Resources/{assets,sounds,minimap}
  minimap/                 # user + CipSoft-seeded tiles
  log/
  screenshots/
  launchermetadata.json
```

## Browser CipSoft Play (sequential Modules)

`/play` matches desktop’s two-binary ship:

1. Portal: progress + OPFS mount + essentials/pack stage (no CIP chrome in Svelte).
2. Cold qtclient: `launcher.wasm` (`launcher-web-current`) — Widgets Download/Update/Play.
3. Warm tip or qtclient Play remount: `tibia.wasm` (`tibiaclient-web-current`) with
   `QTCLIENT_WASM_SKIP_LAUNCHER` — game-only QML (never Widgets + QML together).

Sprite stamp: `.tibia-sprite-packs`. Remount handoff: `tibia.play` /
`tibia.play.transition`. Stale tips (wrong package name / layout): clear site
data and re-Update.
