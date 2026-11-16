/**
 * Extra environment for the /play WASM client (`QTCLIENT_*` / pack vars).
 * Runs in the browser right before boot; may read `location` / `navigator`.
 */
export function playEnv(): Record<string, string> {
	return {};
}
