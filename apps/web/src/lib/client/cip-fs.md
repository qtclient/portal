# CIP package FS layout (desktop + browser)

CipSoft AppData root is Qt `QStandardPaths::AppDataLocation` after the tip's org/app
names (`<Org>` / `<App>`, pack `client.org` / `client.name`) — one API for every OS (no hardcoded Application Support /
AppData / `.local/share` in C++). On /play it is whatever Qt for wasm returns:
the XDG path under the wasm HOME.

| Surface      | CipSoft AppData root                                       | Client package         | Launcher                                   |
| ------------ | ---------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| macOS        | `~/Library/Application Support/<Org>/<App>/`               | `packages/<dir>.app/`  | `/Applications/<App>.app` (bootstrap only) |
| Windows      | `%LOCALAPPDATA%\<Org>\<App>\`                              | `packages/<dir>/`      | installer `<App>.exe`                      |
| Linux        | `~/.local/share/<Org>/<App>/`                              | `packages/<dir>/`      | AppImage / binary                          |
| Browser OPFS | `/home/web_user/.local/share/<Org>/<App>/` (`CIP_APPDATA`) | `packages/<dir>/`      | `packages/LAUNCHER/` (`launcher.wasm`)     |

`<dir>` is the tip's `directoryname` (CipSoft `Tibia`, IdleOT `IdleOT`); the
launcher adds `.app` on macOS only. Inside each package the client follows
CipSoft's layout for that OS: `bin/` + `assets/` + `sounds/` on Linux, Windows and the
browser package; `Contents/MacOS/` + `Contents/Resources/` on macOS. The
client finds its Resources from its own location (CipSoft's
`applicationDirPath/..` plus `Resources` when present), so nothing here or in
C++ names a layout.

Emscripten **home** / OPFS tip is `/home/web_user` (`CIP_HOME`). Packages live
under the AppData path, not directly under HOME.

## Browser CipSoft Play (sequential Modules)

`/play` matches desktop’s two-binary ship:

1. Portal: progress and the launcher package (`launcher-web-current` →
   `packages/LAUNCHER/`, every file, as the desktop installer lays it down:
   the engine plus `mods/<id>/` brand), through `opfs.ts`. No CIP chrome in
   Svelte. Each engine runs with argv[0] (`thisProgram`) inside its package,
   so `applicationDirPath()` is the program's directory, as on desktop.
   Each engine then mounts OPFS itself: its `main()` starts the engine's own
   qtclient-fs Worker (qtclient `browser/qtclient-fs.js`), the only OPFS
   client while it runs.
2. `launcher.wasm` — Widgets Download/Update/Play. It installs the client
   package and CipSoft's asset list (plus mods/minimap channels) into
   `packages/<dir>/` exactly as on desktop.
3. Play: the launcher's `startDetached(program, …)` stores the program path
   (its package's `executable`, e.g. `…/packages/IdleOT/bin/tibia.js`) in the
   `tibia.play` handoff and reloads; the portal boots that program (argv[0])
   and reads `tibia.wasm` / `tibia.data` / `qtloader.js` from its directory —
   like CipSoft's launcher starting the client. Game-only QML (never Widgets +
   QML together).

Remount handoff: `tibia.play` (program path) / `tibia.play.transition`.
