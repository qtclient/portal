<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { goto } from '$app/navigation';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import Button from '#lib/components/ui/Button.svelte';
	import { formatDate } from '#lib/utils.js';

	interface Props {
		onparamschange?: (detail: URLSearchParams) => void;
		data: {
			bans: {
				accountName: string;
				email: string;
				reason: string;
				bannedAt: Date | bigint | number;
				expiresAt: Date | bigint | number | null;
				bannedByName: string;
				isActive: boolean;
			}[];
			page: number;
			hasNext: boolean;
		};
		context?: CommunityPanelContext;
	}

	let { data, context = 'page', onparamschange }: Props = $props();

	function goToPage(nextPage: number) {
		const params = new URLSearchParams({ page: String(nextPage) });
		if (context === 'overlay') {
			onparamschange?.(params);
			return;
		}
		void goto(`/bans?${params.toString()}`);
	}
</script>

<div class="flex flex-col gap-4 w-full max-w-4xl">
	<div class="table-wrap">
		<table class="table table-hover table-auto">
			<thead>
				<tr class="[&>th]:!p-2">
					<th>{$_('bans.account')}</th>
					<th>{$_('bans.reason')}</th>
					<th>{$_('bans.banned-at')}</th>
					<th>{$_('bans.expires-at')}</th>
					<th>{$_('bans.banned-by')}</th>
					<th>{$_('bans.status')}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.bans as ban}
					<tr class="[&>td]:!p-2">
						<td>
							<div class="font-semibold">{ban.accountName}</div>
							<div class="text-xs opacity-75">{ban.email}</div>
						</td>
						<td>{ban.reason}</td>
						<td>{formatDate(ban.bannedAt)}</td>
						<td>{formatDate(ban.expiresAt)}</td>
						<td>{ban.bannedByName}</td>
						<td>
							{#if ban.isActive}
								<span class="badge preset-filled-error-500"
									>{$_('bans.active')}</span>
							{:else}
								<span class="badge preset-filled-success-500"
									>{$_('bans.expired')}</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex gap-2 justify-center">
		{#if data.page > 1}
			<Button variant="soft" size="sm" onclick={() => goToPage(data.page - 1)}>
				{$_('bans.previous')}
			</Button>
		{/if}
		{#if data.hasNext}
			<Button variant="soft" size="sm" onclick={() => goToPage(data.page + 1)}>
				{$_('bans.next')}
			</Button>
		{/if}
	</div>

	{#if data.bans.length === 0}
		<p class="text-sm opacity-75">{$_('bans.none')}</p>
	{/if}
</div>
