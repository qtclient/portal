<script lang="ts">
	import { _ } from 'svelte-i18n';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Steps from '#lib/components/ui/Steps.svelte';
	import { enhance } from '#lib/enchance.js';
	import { vocationString } from '#lib/players.js';

	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let fees = $derived(data.fees);
	let selected = $derived(data.selected);
</script>

{#if !fees}
	<p class="opacity-70">{$_('bazaar.disabled')}</p>
{:else}
	<div class="flex flex-col gap-4">
		<h2 class="h2">{$_('bazaar.create')}</h2>
		<Steps
			steps={4}
			current={data.step - 1}
			label={$_('shop.confirmation.step')} />

		{#if form?.error}
			<p class="text-error-500 text-sm">{form.error}</p>
		{/if}

		{#if data.step === 1}
			<section class="flex flex-col gap-2">
				<h3 class="h4">{$_('bazaar.pick-character')}</h3>
				{#if data.characters.length === 0}
					<p class="opacity-70">{$_('bazaar.no-eligible')}</p>
				{:else}
					<div class="flex flex-col gap-1">
						{#each data.characters as character}
							<a
								href="/bazaar/create?step=2&playerId={character.id}"
								class="card card-tertiary p-2 flex flex-row items-center gap-3 hover:bg-tertiary-400/40">
								<AnimatedOutfit outfit={character} alt={character.name} />
								<span class="flex flex-col">
									<span class="font-semibold">{character.name}</span>
									<span class="text-xs opacity-70">
										{vocationString(character.vocation)} — Level {character.level}
									</span>
								</span>
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{:else if data.step === 2 && selected}
			<section class="flex flex-col gap-2">
				<h3 class="h4">{$_('bazaar.review')}</h3>
				<div class="card card-tertiary p-3 flex flex-row gap-3 items-center">
					<AnimatedOutfit
						outfit={selected}
						alt={selected.name}
						class="scale-125" />
					<div>
						<div class="font-semibold text-lg">{selected.name}</div>
						<div class="text-sm opacity-70">
							{vocationString(selected.vocation)} — Level {selected.level}
						</div>
					</div>
				</div>
				<p class="text-sm opacity-80">{$_('bazaar.review-note')}</p>
				<div class="flex flex-row gap-2">
					<Button href="/bazaar/create?step=1" color="secondary" variant="soft">
						{$_('bazaar.back')}
					</Button>
					<Button href="/bazaar/create?step=3&playerId={selected.id}">
						{$_('next')}
					</Button>
				</div>
			</section>
		{:else if data.step === 3 && selected}
			<form class="flex flex-col gap-3 max-w-md" method="get">
				<input type="hidden" name="step" value="4" />
				<input type="hidden" name="playerId" value={selected.id} />
				<h3 class="h4">{$_('bazaar.setup')}</h3>
				<label class="label">
					<span>{$_('bazaar.start-price')}</span>
					<input
						class="input"
						type="number"
						name="startPrice"
						min={fees.minPrice}
						value={fees.minPrice}
						required />
				</label>
				<label class="label">
					<span>{$_('bazaar.days')}</span>
					<input
						class="input"
						type="number"
						name="days"
						min={fees.minDays}
						max={fees.maxDays}
						value={fees.minDays}
						required />
					<span class="text-xs opacity-70">
						{fees.minDays}–{fees.maxDays}
					</span>
				</label>
				<p class="text-sm opacity-80">
					{$_('bazaar.listing-fee', {
						values: { fee: fees.createFee, tax: fees.taxPercent },
					})}
				</p>
				<div class="flex flex-row gap-2">
					<Button
						href="/bazaar/create?step=2&playerId={selected.id}"
						color="secondary"
						variant="soft">
						{$_('bazaar.back')}
					</Button>
					<Button type="submit">{$_('next')}</Button>
				</div>
			</form>
		{:else if data.step === 4 && selected}
			<form
				method="post"
				action="?/confirm"
				class="flex flex-col gap-3 max-w-md"
				use:enhance>
				<input type="hidden" name="playerId" value={selected.id} />
				<input type="hidden" name="startPrice" value={data.startPrice} />
				<input type="hidden" name="days" value={data.days} />
				<h3 class="h4">{$_('bazaar.confirm')}</h3>
				<div class="data-table">
					<div class="data-row">
						<dt>{$_('character')}</dt>
						<dd>{selected.name}</dd>
					</div>
					<div class="data-row">
						<dt>{$_('bazaar.start-price')}</dt>
						<dd>{data.startPrice}</dd>
					</div>
					<div class="data-row">
						<dt>{$_('bazaar.days')}</dt>
						<dd>{data.days}</dd>
					</div>
					<div class="data-row">
						<dt>{$_('bazaar.fee')}</dt>
						<dd>{fees.createFee}</dd>
					</div>
				</div>
				<div class="flex flex-row gap-2">
					<Button
						href="/bazaar/create?step=3&playerId={selected.id}"
						color="secondary"
						variant="soft">
						{$_('bazaar.back')}
					</Button>
					<Button type="submit" color="success"
						>{$_('bazaar.confirm-submit')}</Button>
				</div>
			</form>
		{:else}
			<p class="opacity-70">{$_('bazaar.pick-character')}</p>
			<Button href="/bazaar/create?step=1">{$_('bazaar.back')}</Button>
		{/if}
	</div>
{/if}
