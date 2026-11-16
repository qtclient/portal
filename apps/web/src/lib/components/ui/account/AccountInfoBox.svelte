<script lang="ts">
	import { formatDuration } from 'date-fns';
	import { _ } from 'svelte-i18n';

	import * as publicEnv from '$app/env/public';

	import type { AccountInfo } from '#lib/accounts.js';
	import Button from '#lib/components/ui/Button.svelte';
	import { formatDate } from '#lib/utils.js';

	const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';
	const PUBLIC_PAYMENTS_URL = (publicEnv.PUBLIC_PAYMENTS_URL || '').replace(
		/\/+$/,
		'',
	);

	interface Props {
		account: AccountInfo;
	}

	let { account }: Props = $props();
</script>

<div class="flex flex-col gap-2">
	<h3 class="h3">{$_('general-information')}</h3>

	<div class="data-table">
		<div class="data-row">
			<dt>{$_('email')}</dt>
			<dd>
				{account.email}
				{#if !account.isVerified}
					<div class="text-error-500">
						{@html $_('account.unverified')}
					</div>
				{:else if account.newEmail}
					<div class="text-warning-800 dark:text-warning-100">
						{$_('account.change-pending', {
							values: { email: account.newEmail },
						})}
						<form action="/account/resend" method="post">
							<button class="anchor" type="submit"
								>{$_('account.resend')}</button>
						</form>
						)
					</div>
				{/if}
			</dd>
		</div>
		{#if account.premiumDays > 0}
			<div class="data-row">
				<dt>{$_('premium-days')}</dt>
				<dd>{formatDuration({ days: account.premiumDays })}</dd>
			</div>
		{/if}
		<div class="data-row">
			<dt>{$_('created')}</dt>
			<dd>{formatDate(account.createdAt)}</dd>
		</div>
		<div class="data-row">
			<dt>{$_('last-login')}</dt>
			<dd>{formatDate(account.lastLogin)}</dd>
		</div>
		<div class="data-row">
			<dt>{$_('game-coins', { values: { PUBLIC_TITLE } })}</dt>
			<dd class="flex flex-row items-center gap-2">
				{account.coins}
			</dd>
		</div>
		<div class="data-row">
			<dt>{$_('game-coins-trasferable', { values: { PUBLIC_TITLE } })}</dt>
			<dd class="flex flex-row items-center gap-2">
				{account.coinsTransferable}
				<Button
					href={PUBLIC_PAYMENTS_URL ||
						'/account?subtopic=redirectlogin&clienttarget=payment&clientselection=SC3'}
					size="sm"
					color="success"
					class="py-0.5 px-2">{$_('get-coins')}</Button>
			</dd>
		</div>
	</div>
</div>
