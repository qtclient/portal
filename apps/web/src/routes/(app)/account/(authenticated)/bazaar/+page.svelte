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
		<h3 class="h3">{$_('bazaar.my-auctions')}</h3>
		<a href="/account/bazaar/bids" class="anchor text-sm"
			>{$_('bazaar.my-bids')}</a>
	</header>

	{#if data.auctions.length === 0}
		<p class="opacity-70">{$_('bazaar.my-auctions-empty')}</p>
	{:else}
		<div class="table-wrap">
			<table class="table table-hover table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th>{$_('outfit')}</th>
						<th>{$_('name')}</th>
						<th>{$_('bazaar.current-bid')}</th>
						<th>{$_('bazaar.status')}</th>
						<th>{$_('bazaar.ends')}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.auctions as auction}
						<tr class="[&>td]:!p-2 [&>td]:!align-middle">
							<td>
								<AnimatedOutfit
									outfit={auction.player}
									alt={auction.player.name} />
							</td>
							<td>
								<a href="/bazaar/{auction.id}" class="anchor"
									>{auction.player.name}</a>
							</td>
							<td>{auction.currentPrice}</td>
							<td>{auction.status}</td>
							<td class="text-sm">{formatDate(auction.endsAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
