/**
 * Portal auth API shared by the website login popover and the launcher.
 *
 * - Website login (`sid` cookie) → `/api/account/web-login`
 * - Launcher login → long-lived device token (`/api/auth/device`)
 * - Game client login is CIP-shaped only: tibia → `POST /clientservices/loginservice.php` (no play SSO)
 * - A manual login in the client returns a switch code; `/play` exchanges it
 *   at `/api/auth/switch` and the launcher at `/api/auth/device`.
 */

export type Credentials = {
	email: string;
	password: string;
	/** TOTP or backup code; send after a `tokenRequired` result. */
	token?: string;
};

export type FieldErrors = Partial<Record<string, string[]>>;

export type LoginFailure = {
	ok: false;
	/** The account has 2FA: resend the same credentials with `token`. */
	tokenRequired: boolean;
	errors: FieldErrors;
	status: number;
};

export type WebLoginSuccess = {
	ok: true;
	email: string;
};

export type DeviceLoginSuccess = {
	ok: true;
	email: string;
	deviceId: string;
	token: string;
};

export type DeviceInfo = { email: string; deviceId: string; name: string };

export class AuthError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'AuthError';
		this.status = status;
	}

	/** The device token was revoked or never existed; sign the user out. */
	get unauthorized(): boolean {
		return this.status === 401;
	}
}

export type AuthClientOptions = {
	/** Portal origin, e.g. `https://www.example.com`. Empty for same-origin. */
	baseUrl?: string;
	/** Override for environments without CORS-free fetch (Tauri plugin-http). */
	fetch?: typeof fetch;
};

type ApiBody = {
	ok?: boolean;
	tokenRequired?: boolean;
	errors?: FieldErrors;
	[key: string]: unknown;
};

export function firstError(errors: FieldErrors): string | undefined {
	return (
		errors.global?.[0] ??
		Object.values(errors).find((list) => list?.length)?.[0]
	);
}

export function createAuthClient(options: AuthClientOptions = {}) {
	const base = (options.baseUrl ?? '').replace(/\/+$/, '');
	const doFetch = options.fetch ?? ((...args) => fetch(...args));

	async function call(
		method: string,
		path: string,
		init: { body?: unknown; deviceToken?: string } = {},
	): Promise<{ status: number; body: ApiBody }> {
		const headers: Record<string, string> = { Accept: 'application/json' };
		if (init.body !== undefined) headers['Content-Type'] = 'application/json';
		if (init.deviceToken) headers.Authorization = `Bearer ${init.deviceToken}`;
		const res = await doFetch(`${base}${path}`, {
			method,
			headers,
			credentials: 'include',
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
		});
		const body = (await res.json().catch(() => ({}))) as ApiBody;
		return { status: res.status, body };
	}

	function failure(status: number, body: ApiBody): LoginFailure {
		return {
			ok: false,
			tokenRequired: Boolean(body.tokenRequired),
			errors: body.errors ?? {},
			status,
		};
	}

	function expectOk(status: number, body: ApiBody): void {
		if (status >= 400 || !body.ok) {
			throw new AuthError(
				firstError(body.errors ?? {}) ?? `HTTP ${status}`,
				status,
			);
		}
	}

	return {
		/** Website session (`sid` cookie). Game client uses CIP loginservice.php separately. */
		async webLogin(
			credentials: Credentials,
		): Promise<WebLoginSuccess | LoginFailure> {
			const { status, body } = await call('POST', '/api/account/web-login', {
				body: credentials,
			});
			if (!body.ok || typeof body.email !== 'string') {
				return failure(status, body);
			}
			return {
				ok: true,
				email: body.email,
			};
		},

		/** Launcher sign-in; the launcher persists `token` locally. */
		async deviceLogin(
			credentials: Credentials & { deviceName?: string },
		): Promise<DeviceLoginSuccess | LoginFailure> {
			const { status, body } = await call('POST', '/api/auth/device', {
				body: credentials,
			});
			if (
				!body.ok ||
				typeof body.token !== 'string' ||
				typeof body.email !== 'string'
			) {
				return failure(status, body);
			}
			return {
				ok: true,
				email: body.email,
				deviceId: String(body.deviceId),
				token: body.token,
			};
		},

		async deviceInfo(deviceToken: string): Promise<DeviceInfo> {
			const { status, body } = await call('GET', '/api/auth/device', {
				deviceToken,
			});
			expectOk(status, body);
			return {
				email: String(body.email),
				deviceId: String(body.deviceId),
				name: String(body.name),
			};
		},

		async deviceLogout(deviceToken: string): Promise<void> {
			// A JSON body keeps SvelteKit's CSRF check from treating this as a form post.
			const { status, body } = await call('DELETE', '/api/auth/device', {
				body: {},
				deviceToken,
			});
			// Already revoked counts as logged out.
			if (status !== 401) expectOk(status, body);
		},

		/**
		 * Legacy: move the website session via a one-time switch code.
		 * CIP loginservice.php no longer issues these; prefer web-login / device token.
		 */
		async switchWeb(code: string): Promise<{ email: string }> {
			const { status, body } = await call('POST', '/api/auth/switch', {
				body: { code },
			});
			expectOk(status, body);
			return { email: String(body.email) };
		},

		/** Launcher: a new device token for the account the player logged into in the game client. */
		async deviceFromSwitch(
			code: string,
			deviceName?: string,
		): Promise<DeviceLoginSuccess> {
			const { status, body } = await call('POST', '/api/auth/device', {
				body: { code, deviceName },
			});
			expectOk(status, body);
			return {
				ok: true,
				email: String(body.email),
				deviceId: String(body.deviceId),
				token: String(body.token),
			};
		},
	};
}

export type AuthClient = ReturnType<typeof createAuthClient>;
