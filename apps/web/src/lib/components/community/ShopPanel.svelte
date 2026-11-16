<script lang="ts">
	import { _ } from 'svelte-i18n';

	import * as publicEnv from '$app/env/public';

	interface Props {
		data: { isLoggedIn?: boolean };
	}

	let { data }: Props = $props();

	const payments = (publicEnv.PUBLIC_PAYMENTS_URL || '').replace(/\/+$/, '');
	const getCoins =
		payments ||
		'/account?subtopic=redirectlogin&clienttarget=payment&clientselection=SC3';
</script>

<div class="flex flex-col items-center gap-3 py-6 text-center max-w-md mx-auto">
	<p class="text-sm opacity-85">
		{$_('buy-coins')}
	</p>
	{#if data.isLoggedIn}
		<a
			href={getCoins}
			class="btn preset-filled-primary-500"
			rel="noopener noreferrer">
			{$_('shop.title')}
		</a>
	{:else}
		<a
			href={`/account/login?returnTo=${encodeURIComponent(getCoins)}`}
			class="btn preset-filled-primary-500">
			{$_('login')}
		</a>
	{/if}
</div>
