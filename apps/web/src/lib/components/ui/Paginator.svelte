<script lang="ts">
	import {
		faChevronLeft,
		faChevronRight,
	} from '@fortawesome/free-solid-svg-icons';
	import { Pagination } from '@skeletonlabs/skeleton-svelte';
	import Fa from 'svelte-fa';

	interface Props {
		/** 1-based page index. */
		page: number;
		limit: number;
		count: number;
		amounts?: number[];
		amountText?: string;
		onchange: (detail: { page: number; limit: number }) => void;
	}

	let {
		page,
		limit,
		count,
		amounts = [],
		amountText = 'per page',
		onchange,
	}: Props = $props();
</script>

<div class="flex flex-col items-center justify-between gap-2 md:flex-row">
	{#if amounts.length > 0}
		<label class="flex items-center gap-2">
			<select
				class="select w-auto"
				value={limit}
				onchange={(e) =>
					onchange({ page: 1, limit: Number(e.currentTarget.value) })}>
				{#each amounts as amount}
					<option value={amount}>{amount} {amountText}</option>
				{/each}
			</select>
		</label>
	{/if}
	<Pagination
		{count}
		pageSize={limit}
		{page}
		onPageChange={(e) => onchange({ page: e.page, limit })}>
		<Pagination.PrevTrigger>
			<Fa icon={faChevronLeft} />
		</Pagination.PrevTrigger>
		<Pagination.Context>
			{#snippet children(pagination)}
				{#each pagination().pages as item, index (item)}
					{#if item.type === 'page'}
						<Pagination.Item {...item}>{item.value}</Pagination.Item>
					{:else}
						<Pagination.Ellipsis {index}>&#8230;</Pagination.Ellipsis>
					{/if}
				{/each}
			{/snippet}
		</Pagination.Context>
		<Pagination.NextTrigger>
			<Fa icon={faChevronRight} />
		</Pagination.NextTrigger>
	</Pagination>
</div>
