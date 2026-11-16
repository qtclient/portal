<script lang="ts">
	import { _ } from 'svelte-i18n';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import { vocationString } from '#lib/players.js';
	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-row justify-between items-center gap-2">
		<h2 class="h2">{$_('bazaar.past')}</h2>
		<a href="/bazaar" class="anchor text-sm">{$_('bazaar.current')}</a>
	</header>

	{#if data.auctions.length === 0}
		<p class="opacity-70">{$_('bazaar.past-empty')}</p>
	{:else}
		<div class="table-wrap">
			<table class="table table-hover table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th>{$_('outfit')}</th>
						<th>{$_('name')}</th>
						<th>{$_('level')}</th>
						<th>{$_('bazaar.final-price')}</th>
						<th>{$_('bazaar.status')}</th>
						<th>{$_('bazaar.ended')}</th>
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
								<a
									href="/characters/{auction.player.name}"
									class="anchor font-semibold">
									{auction.player.name}
								</a>
								<div class="text-xs opacity-70">
									{vocationString(auction.player.vocation)}
								</div>
							</td>
							<td>{auction.player.level}</td>
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
