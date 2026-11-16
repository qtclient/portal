<script lang="ts">
	import { _ } from 'svelte-i18n';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { vocationString } from '#lib/players.js';
	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-row justify-between items-center gap-2 flex-wrap">
		<h2 class="h2">{$_('bazaar.title')}</h2>
		<div class="flex flex-row gap-2">
			<a href="/bazaar/past" class="anchor text-sm">{$_('bazaar.past')}</a>
		</div>
	</header>
	<p class="text-sm opacity-80">{$_('bazaar.sell-in-client')}</p>

	{#if data.auctions.length === 0}
		<p class="opacity-70">{$_('bazaar.empty')}</p>
	{:else}
		<div class="table-wrap">
			<table class="table table-hover table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th>{$_('outfit')}</th>
						<th>{$_('name')}</th>
						<th>{$_('level')}</th>
						<th>{$_('bazaar.current-bid')}</th>
						<th>{$_('bazaar.ends')}</th>
						<th></th>
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
							<td>
								{auction.currentPrice}
								{#if !auction.hasBidder}
									<span class="text-xs opacity-60"
										>({$_('bazaar.starting')})</span>
								{/if}
							</td>
							<td class="text-sm">{formatDate(auction.endsAt)}</td>
							<td>
								<a href="/bazaar/{auction.id}" class="anchor"
									>{$_('bazaar.details')}</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
