# CIP package FS layout (desktop + browser)

CipSoft AppData root is Qt `QStandardPaths::AppDataLocation` after the tip's org/app
names (`<Org>` / `<App>`, pack `client.org` / `client.name`) — one API for every OS (no hardcoded Application Support /
AppData / `.local/share` in C++).

| Surface                           | CipSoft AppData root                                         | Client package                     | Launcher                                    |
| --------------------------------- | ------------------------------------------------------------ | ---------------------------------- | ------------------------------------------- |
| macOS                             | `~/Library/Application Support/<Org>/<App>/`                 | `packages/<PACKAGE_CLIENT>/`       | `/Applications/<App>.app` (bootstrap only)   |
| Windows                           | `%APPDATA%\<Org>\<App>\`                                     | `packages/<PACKAGE_CLIENT>/`       | installer `<App>.exe`                       |
| Linux                             | `~/.local/share/<Org>/<App>/`                                | `packages/<PACKAGE_CLIENT>/`       | AppImage / binary                           |
| Browser OPFS                      | `/home/web_user/.local/share/<Org>/<App>/` (`CIP_APPDATA`)   | `packages/<PACKAGE_CLIENT>/`       | `packages/LAUNCHER/` (`launcher.wasm`)      |

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

1. Portal: progress, the qtclient-fs OPFS Worker, the launcher package
   (`launcher-web-current` → `packages/LAUNCHER/`, the desktop app install) and
   the tip pack stage (`mods/<pack>/`). No CIP chrome in Svelte.
2. `launcher.wasm` — Widgets Download/Update/Play. It installs the client
   package and CipSoft `assets.json` (plus mods/minimap channels) into
   `packages/<PACKAGE_CLIENT>/` exactly as on desktop.
3. Play (or a warm, up-to-date install): the page reloads into `tibia.wasm`,
   loaded from `packages/<PACKAGE_CLIENT>/` like CipSoft's launcher starting
   the client — game-only QML (never Widgets + QML together).

Remount handoff: `tibia.play` /
`tibia.play.transition`. Stale tips (wrong package name / layout): clear site
data and re-Update.
