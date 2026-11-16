<script lang="ts" module>
	export type LoginLabels = {
		email: string;
		password: string;
		token: string;
		tokenHint: string;
		submit: string;
		lostAccount: string;
		noAccount: string;
		signup: string;
		genericError: string;
	};

	const defaultLabels: LoginLabels = {
		email: 'E-mail',
		password: 'Password',
		token: 'Authenticator code',
		tokenHint: 'Enter the code from your authenticator app or a backup code.',
		submit: 'Log in',
		lostAccount: 'Lost account?',
		noAccount: "Don't have an account?",
		signup: 'Create account',
		genericError: 'Something went wrong. Try again.',
	};
</script>

<script lang="ts" generics="T extends { ok: true }">
	import {
		type Credentials,
		firstError,
		type LoginFailure,
	} from '@qtc-aac/auth-client';

	interface Props {
		login: (credentials: Credentials) => Promise<T | LoginFailure>;
		onsuccess: (result: T) => void;
		labels?: Partial<LoginLabels>;
		lostAccountHref?: string;
		signupHref?: string;
		/** Open links yourself (e.g. in the system browser); defaults to a new tab. */
		onlink?: (href: string) => void;
	}

	let {
		login,
		onsuccess,
		labels: labelOverrides = {},
		lostAccountHref,
		signupHref,
		onlink,
	}: Props = $props();

	let labels = $derived({ ...defaultLabels, ...labelOverrides });

	let email = $state('');
	let password = $state('');
	let token = $state('');
	let tokenRequired = $state(false);
	let loading = $state(false);
	let error = $state('');

	async function submit() {
		loading = true;
		error = '';
		try {
			const result = await login(
				tokenRequired ? { email, password, token } : { email, password },
			);
			if (result.ok) {
				onsuccess(result);
				return;
			}
			if (result.tokenRequired && !tokenRequired) {
				tokenRequired = true;
				token = '';
				return;
			}
			error = firstError(result.errors) ?? labels.genericError;
		} catch {
			error = labels.genericError;
		} finally {
			loading = false;
		}
	}

	function link(event: MouseEvent, href: string) {
		if (!onlink) return;
		event.preventDefault();
		onlink(href);
	}
</script>

<form
	class="qtc-login"
	onsubmit={(event) => {
		event.preventDefault();
		void submit();
	}}>
	{#if error}
		<p class="qtc-login__error" role="alert">{error}</p>
	{/if}

	{#if tokenRequired}
		<label class="qtc-login__field">
			<span>{labels.token}</span>
			<input
				required
				class="qtc-login__input"
				inputmode="numeric"
				autocomplete="one-time-code"
				bind:value={token} />
			{#if labels.tokenHint}
				<small class="qtc-login__hint">{labels.tokenHint}</small>
			{/if}
		</label>
	{:else}
		<label class="qtc-login__field">
			<span>{labels.email}</span>
			<input
				required
				class="qtc-login__input"
				type="email"
				autocomplete="email"
				bind:value={email} />
		</label>
		<label class="qtc-login__field">
			<span>{labels.password}</span>
			<input
				required
				class="qtc-login__input"
				type="password"
				autocomplete="current-password"
				bind:value={password} />
		</label>
	{/if}

	<div class="qtc-login__actions">
		{#if lostAccountHref}
			<a
				class="qtc-login__link"
				href={lostAccountHref}
				target="_blank"
				rel="noopener noreferrer"
				onclick={(e) => link(e, lostAccountHref)}>
				{labels.lostAccount}
			</a>
		{:else}
			<span></span>
		{/if}
		<button type="submit" class="qtc-login__submit" disabled={loading}>
			{loading ? '...' : labels.submit}
		</button>
	</div>

	{#if signupHref}
		<hr class="qtc-login__divider" />
		<div class="qtc-login__footer">
			<span>{labels.noAccount}</span>
			<a
				class="qtc-login__signup"
				href={signupHref}
				target="_blank"
				rel="noopener noreferrer"
				onclick={(e) => link(e, signupHref)}>
				{labels.signup}
			</a>
		</div>
	{/if}
</form>

<style>
	.qtc-login {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		min-width: 16rem;
		font-size: 0.8125rem;
	}
	.qtc-login__field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		color: #b7c2d0;
	}
	.qtc-login__input {
		border: 1px solid rgba(158, 197, 232, 0.2);
		border-radius: 0.3rem;
		background: rgba(8, 10, 14, 0.6);
		color: #e8edf4;
		padding: 0.4rem 0.55rem;
		font: inherit;
	}
	.qtc-login__input:focus {
		outline: none;
		border-color: rgba(158, 197, 232, 0.45);
	}
	.qtc-login__hint {
		font-size: 0.7rem;
		opacity: 0.75;
	}
	.qtc-login__actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-top: 0.15rem;
	}
	.qtc-login__link {
		color: #9ec5e8;
		text-decoration: none;
		font-size: 0.75rem;
	}
	.qtc-login__link:hover {
		color: #c5dcf0;
	}
	.qtc-login__submit {
		border: 0;
		border-radius: 0.3rem;
		background: linear-gradient(180deg, #5a8fbf 0%, #3d6f9a 100%);
		color: #f4f8fc;
		padding: 0.35rem 0.85rem;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	.qtc-login__submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
	.qtc-login__divider {
		border: 0;
		border-top: 1px solid rgba(158, 197, 232, 0.14);
		margin: 0.15rem 0;
	}
	.qtc-login__footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.35rem;
		color: #b7c2d0;
		font-size: 0.75rem;
		text-align: center;
	}
	.qtc-login__signup {
		color: #9ec5e8;
		text-decoration: none;
		font-weight: 600;
	}
	.qtc-login__signup:hover {
		color: #c5dcf0;
	}
	.qtc-login__error {
		margin: 0;
		color: #e35d6a;
		font-size: 0.75rem;
	}
</style>
