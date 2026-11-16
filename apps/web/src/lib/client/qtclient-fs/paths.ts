/**
 * Unified durable tip FS layout (VFS → origin OPFS).
 *
 * | VFS | OPFS |
 * |-----|------|
 * | `/home/web_user` | `` (origin root) |
 * | `/home/web_user/<rel>` | `<rel>` |
 * | `/mods/<rel>` | `mods/<rel>` |
 * | `/data/<rel>` | `data/<rel>` |
 */

export const QTCLIENT_FS_HOME = '/home/web_user';
export const QTCLIENT_FS_MODS = '/mods';
export const QTCLIENT_FS_DATA = '/data';

export function isQtclientFsPath(path: string): boolean {
	const p = path.startsWith('/') ? path : `/${path}`;
	return (
		p === QTCLIENT_FS_HOME ||
		p.startsWith(`${QTCLIENT_FS_HOME}/`) ||
		p === QTCLIENT_FS_MODS ||
		p.startsWith(`${QTCLIENT_FS_MODS}/`) ||
		p === QTCLIENT_FS_DATA ||
		p.startsWith(`${QTCLIENT_FS_DATA}/`)
	);
}

/** Normalize to absolute VFS path under qtclient-fs roots. */
export function absQtclientFsPath(path: string): string {
	const p = path.startsWith('/') ? path : `/${path}`;
	if (!isQtclientFsPath(p)) {
		throw new Error(`qtclient-fs path outside allowed roots: ${path}`);
	}
	return p;
}

/**
 * VFS absolute → OPFS relative (from origin root).
 * Home maps under origin root; `/mods` and `/data` keep their first segment.
 */
export function opfsRelFromQtclientAbs(absPath: string): string {
	const abs = absQtclientFsPath(absPath);
	if (abs === QTCLIENT_FS_HOME) return '';
	if (abs.startsWith(`${QTCLIENT_FS_HOME}/`)) {
		return abs.slice(QTCLIENT_FS_HOME.length + 1);
	}
	// `/mods` → `mods`, `/data/foo` → `data/foo`
	return abs.slice(1);
}
