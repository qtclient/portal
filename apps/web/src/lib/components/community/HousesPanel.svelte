<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { goto } from '$app/navigation';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import Select from '#lib/components/ui/forms/Select.svelte';

	interface Props {
		onparamschange?: (detail: URLSearchParams) => void;
		data: {
			towns: { id: number; name: string }[];
			houses: {
				name: string;
				townName: string;
				size: number;
				rent: number;
				ownerLabel: string;
				ownerLink: string | null;
			}[];
			townId: number;
			order: string;
			freeOnly: boolean;
		};
		context?: CommunityPanelContext;
	}

	let { data, context = 'page', onparamschange }: Props = $props();

	let townId = $state(String(data.townId));
	let order = $state(data.order);
	let freeOnly = $state(data.freeOnly);

	$effect.pre(() => {
		townId = String(data.townId);
		order = data.order;
		freeOnly = data.freeOnly;
	});

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);

	function buildParams() {
		const params = new URLSearchParams();
		if (Number(townId) > 0) {
			params.set('town', townId);
		}
		if (freeOnly) {
			params.set('state', 'free');
		}
		params.set('order', order);
		return params;
	}

	function submitFilters() {
		const params = buildParams();
		if (context === 'overlay') {
			onparamschange?.(params);
			return;
		}
		void goto(`/houses?${params.toString()}`);
	}
</script>

<div class="flex flex-col gap-4 w-full max-w-4xl">
	<form
		class="flex flex-wrap gap-2 items-end"
		method="get"
		onsubmit={(event) => {
			event.preventDefault();
			void submitFilters();
		}}>
		<Select
			name="town"
			label={$_('houses.town')}
			variant="horizontal"
			bind:value={townId}
			onchange={submitFilters}>
			<option value="0">{$_('houses.all-towns')}</option>
			{#each data.towns as town}
				<option value={String(town.id)}>{town.name}</option>
			{/each}
		</Select>
		<Select
			name="order"
			label={$_('houses.order')}
			variant="horizontal"
			bind:value={order}
			onchange={submitFilters}>
			<option value="name">{$_('name')}</option>
			<option value="size">{$_('houses.size')}</option>
			<option value="rent">{$_('houses.rent')}</option>
		</Select>
		<label class="flex items-center gap-2 text-sm">
			<input
				type="checkbox"
				name="state"
				value="free"
				checked={freeOnly}
				onchange={(e) => {
					freeOnly = e.currentTarget.checked;
					submitFilters();
				}} />
			{$_('houses.free-only')}
		</label>
	</form>

	<div class="table-wrap">
		<table class="table table-hover table-auto">
			<thead>
				<tr class="[&>th]:!p-2">
					<th>{$_('name')}</th>
					<th>{$_('houses.town')}</th>
					<th>{$_('houses.size')}</th>
					<th>{$_('houses.rent')}</th>
					<th>{$_('houses.owner')}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.houses as house}
					<tr class="[&>td]:!p-2">
						<td>
							<a
								href="/houses/{encodeURIComponent(house.name)}"
								class="anchor font-semibold"
								target={linkTarget}
								rel={linkRel}>
								{house.name}
							</a>
						</td>
						<td>{house.townName}</td>
						<td>{house.size}</td>
						<td>{house.rent.toLocaleString()}</td>
						<td>
							{#if house.ownerLink}
								<a
									href={house.ownerLink}
									class="anchor"
									target={linkTarget}
									rel={linkRel}>{house.ownerLabel}</a>
							{:else}
								{house.ownerLabel}
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if data.houses.length === 0}
		<p class="text-sm opacity-75">{$_('houses.none')}</p>
	{/if}
</div>
