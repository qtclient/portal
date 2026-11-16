<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';

	interface Props {
		is2faEnabled: boolean;
		isVerified: boolean;
		isChangingEmail: boolean;
	}

	let { is2faEnabled, isVerified, isChangingEmail }: Props = $props();
</script>

<div class="flex flex-row justify-between gap-2">
	<span></span>
	<div class="flex flex-row justify-start gap-2 flex-wrap">
		{#if isVerified}
			{#if is2faEnabled}
				<Button href="/account/disable-2fa" size="sm" color="error" noscroll>
					{$_('disable-2fa.button')}
				</Button>
			{:else}
				<Button href="/account/enable-2fa" size="sm" color="success" noscroll>
					{$_('enable-2fa')}
				</Button>
			{/if}
		{/if}
		<Button href="/account/change-password" size="sm" noscroll>
			{$_('change-password')}
		</Button>
		{#if !isChangingEmail}
			<Button href="/account/change-email" size="sm" noscroll>
				{$_('change-email')}
			</Button>
		{/if}
		<Button href="/account/devices" size="sm" noscroll>
			{$_('devices.title')}
		</Button>
		<Button href="/account/referral" size="sm" noscroll>
			{$_('referral.title')}
		</Button>
		<Button href="/account/bazaar" size="sm" noscroll>
			{$_('bazaar.my-auctions')}
		</Button>
	</div>
</div>
