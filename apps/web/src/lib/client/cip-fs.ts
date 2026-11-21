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

/**
 * Compile-time launcher/client default when tip brand.json is not loaded yet
 * (`TIBIA_PRODUCT_ORG` / `Tibia` in qtclient CMake). The wasm may still install
 * packages here even when the portal pack brands its own org/app — handoff must
 * accept both or /play loops launcher→reload→launcher forever.
 */
const STOCK_APPDATA = `${CIP_HOME}/.local/share/CipSoft/Tibia`;

/** The launcher's own package (installed by the portal, see cip-package.ts). */
export const PACKAGE_LAUNCHER = 'LAUNCHER';
export function packageFsRoot(name: string): string {
	return `${CIP_APPDATA}/packages/${name}`;
}

/**
 * Where CipSoft's AppData ends: a program the launcher starts must live under
 * `<AppData>/packages/` (the launcher installs every package there).
 *
 * Accept pack brand AppData and the stock CipSoft/Tibia root (and any other
 * `.local/share/<org>/<app>/packages/` under HOME) so a tip brand miss cannot
 * reject a real tibia.js handoff.
 */
export function isInstalledProgram(path: string): boolean {
	if (!path || path.includes('/../')) return false;
	const packagesMarker = '/packages/';
	const idx = path.indexOf(packagesMarker);
	if (idx < 0) return false;
	const appData = path.slice(0, idx);
	if (appData === CIP_APPDATA || appData === STOCK_APPDATA) return true;
	// Any XDG AppData under the wasm HOME (org/app may differ from pack brand).
	const share = `${CIP_HOME}/.local/share/`;
	if (!appData.startsWith(share)) return false;
	const rest = appData.slice(share.length);
	const slash = rest.indexOf('/');
	return slash > 0 && rest.indexOf('/', slash + 1) < 0;
}
