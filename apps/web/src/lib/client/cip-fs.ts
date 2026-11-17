/**
 * CipSoft package layout on /play (cip-fs.md).
 *
 * The wasm's HOME is `/home/web_user`, the origin's OPFS (qtclient-fs). CipSoft
 * AppData is Qt's AppDataLocation under it — the XDG path, as on Linux — with
 * the tip's org / app names (pack `client.org` / `client.name`). Packages live
 * under `<AppData>/packages/<directoryname>/`.
 */

import { pack } from '#lib/pack.js';

const BRAND = pack.client;

/** Tip pack staged under `mods/<id>/` for /play, or null for a stock tip. */
export const CLIENT_PACK_ID = BRAND.packId;

/** Display name of the client (`Loading <name>…`). */
export const CLIENT_NAME = BRAND.name;

/** The wasm's HOME, mounted on the origin OPFS. */
export const CIP_HOME = '/home/web_user';

/** Qt `writableLocation(AppDataLocation)` in the wasm, once the tip's names are set. */
const CIP_APPDATA = `${CIP_HOME}/.local/share/${BRAND.org}/${BRAND.name}`;

/** The launcher's own package (installed by the portal, see cip-package.ts). */
export const PACKAGE_LAUNCHER = 'LAUNCHER';
export function packageFsRoot(name: string): string {
	return `${CIP_APPDATA}/packages/${name}`;
}

/**
 * Where CipSoft's AppData ends: a program the launcher starts must live under
 * `<AppData>/packages/` (the launcher installs every package there).
 */
export function isInstalledProgram(path: string): boolean {
	return path.startsWith(`${CIP_APPDATA}/packages/`) && !path.includes('/../');
}
