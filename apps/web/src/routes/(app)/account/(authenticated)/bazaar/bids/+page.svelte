<script lang="ts">
	import { _ } from 'svelte-i18n';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<div class="flex flex-col gap-4 mt-4">
	<header class="flex flex-row justify-between items-center gap-2">
		<h3 class="h3">{$_('bazaar.my-bids')}</h3>
		<a href="/account/bazaar" class="anchor text-sm"
			>{$_('bazaar.my-auctions')}</a>
	</header>

	{#if data.bids.length === 0}
		<p class="opacity-70">{$_('bazaar.my-bids-empty')}</p>
	{:else}
		<div class="table-wrap">
			<table class="table table-hover table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th>{$_('outfit')}</th>
						<th>{$_('name')}</th>
						<th>{$_('bazaar.amount')}</th>
						<th>{$_('bazaar.status')}</th>
						<th>{$_('shop.history.date')}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.bids as bid}
						<tr class="[&>td]:!p-2 [&>td]:!align-middle">
							<td>
								<AnimatedOutfit outfit={bid.player} alt={bid.player.name} />
							</td>
							<td>
								<a href="/bazaar/{bid.auctionId}" class="anchor"
									>{bid.player.name}</a>
								{#if bid.isHighBidder}
									<span class="text-xs text-success-500 ml-1"
										>{$_('bazaar.high-bid')}</span>
								{/if}
							</td>
							<td>{bid.amount}</td>
							<td>{bid.auctionStatus}</td>
							<td class="text-sm">{formatDate(bid.createdAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
