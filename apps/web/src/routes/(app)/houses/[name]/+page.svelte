<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#if data.house}
	<div class="data-table w-full max-w-xl">
		<div class="data-row">
			<dt>{$_('name')}</dt>
			<dd>{data.house.name}</dd>
		</div>
		<div class="data-row">
			<dt>{$_('houses.town')}</dt>
			<dd>{data.house.townName}</dd>
		</div>
		<div class="data-row">
			<dt>{$_('houses.size')}</dt>
			<dd>{data.house.size}</dd>
		</div>
		<div class="data-row">
			<dt>{$_('houses.rent')}</dt>
			<dd>{data.house.rent.toLocaleString()}</dd>
		</div>
		<div class="data-row">
			<dt>{$_('houses.beds')}</dt>
			<dd>{data.house.beds}</dd>
		</div>
		<div class="data-row">
			<dt>{$_('houses.owner')}</dt>
			<dd>
				{#if data.house.ownerLink}
					<a href={data.house.ownerLink} class="anchor"
						>{data.house.ownerLabel}</a>
				{:else}
					{data.house.ownerLabel}
				{/if}
			</dd>
		</div>
		{#if data.house.paidUntil}
			<div class="data-row">
				<dt>{$_('houses.paid-until')}</dt>
				<dd>{formatDate(data.house.paidUntil)}</dd>
			</div>
		{/if}
	</div>
{/if}
