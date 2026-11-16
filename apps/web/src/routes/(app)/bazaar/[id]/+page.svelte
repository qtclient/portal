<script lang="ts">
	import { _ } from 'svelte-i18n';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import { enhance } from '#lib/enchance.js';
	import { vocationString } from '#lib/players.js';
	import { formatDate } from '#lib/utils.js';

	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

{#if !data.auction}
	<p class="opacity-70">{$_('bazaar.not-found')}</p>
{:else}
	{@const auction = data.auction}
	<div class="flex flex-col gap-4">
		<header class="flex flex-row gap-4 items-center">
			<AnimatedOutfit
				class="h-20 scale-125"
				outfit={auction.player}
				alt={auction.player.name} />
			<div>
				<h2 class="h2">
					<a href="/characters/{auction.player.name}" class="anchor">
						{auction.player.name}
					</a>
				</h2>
				<p class="text-sm opacity-70">
					{vocationString(auction.player.vocation)} — Level {auction.player
						.level}
				</p>
			</div>
		</header>

		<div class="data-table">
			<div class="data-row">
				<dt>{$_('bazaar.status')}</dt>
				<dd>{auction.status}</dd>
			</div>
			<div class="data-row">
				<dt>{$_('bazaar.starting')}</dt>
				<dd>{auction.startPrice}</dd>
			</div>
			<div class="data-row">
				<dt>{$_('bazaar.current-bid')}</dt>
				<dd>
					{auction.currentPrice}
					{#if !auction.hasBidder}
						<span class="text-xs opacity-60">({$_('bazaar.no-bids')})</span>
					{/if}
				</dd>
			</div>
			<div class="data-row">
				<dt>{$_('bazaar.ends')}</dt>
				<dd>{formatDate(auction.endsAt)}</dd>
			</div>
			<div class="data-row">
				<dt>{$_('bazaar.tax')}</dt>
				<dd>{auction.taxPercent}%</dd>
			</div>
			<div class="data-row">
				<dt>{$_('bazaar.bid-fee')}</dt>
				<dd>{auction.bidFee}</dd>
			</div>
		</div>

		{#if auction.status === 'LISTED' && data.isLoggedIn && !data.isSeller}
			<form
				method="post"
				action="?/bid"
				class="card card-tertiary p-3 flex flex-col gap-2 max-w-sm"
				use:enhance>
				{#if form?.error}
					<p class="text-error-500 text-sm">{form.error}</p>
				{/if}
				<label class="label">
					<span>{$_('bazaar.your-bid')}</span>
					<input
						class="input"
						type="number"
						name="bid"
						min={auction.hasBidder
							? auction.currentPrice + 1
							: auction.currentPrice}
						value={auction.hasBidder
							? auction.currentPrice + 1
							: auction.currentPrice}
						required />
				</label>
				<p class="text-xs opacity-70">
					{$_('bazaar.bid-hint', { values: { fee: auction.bidFee } })}
				</p>
				<Button type="submit">{$_('bazaar.place-bid')}</Button>
			</form>
		{:else if !data.isLoggedIn && auction.status === 'LISTED'}
			<p class="text-sm">
				<a href="/account/login?redirect=/bazaar/{auction.id}" class="anchor">
					{$_('login')}
				</a>
				{$_('bazaar.login-to-bid')}
			</p>
		{:else if data.isSeller}
			<p class="text-sm opacity-70">{$_('bazaar.own-auction')}</p>
		{/if}

		{#if auction.bids.length > 0}
			<section>
				<h3 class="h4">{$_('bazaar.bid-history')}</h3>
				<div class="table-wrap">
					<table class="table table-auto">
						<thead>
							<tr class="[&>th]:!p-2">
								<th>{$_('shop.history.date')}</th>
								<th>{$_('bazaar.amount')}</th>
								<th>{$_('bazaar.fee')}</th>
							</tr>
						</thead>
						<tbody>
							{#each auction.bids as bid}
								<tr class="[&>td]:!p-2">
									<td>{formatDate(bid.created_at)}</td>
									<td>{bid.amount}</td>
									<td>{bid.fee}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	</div>
{/if}
