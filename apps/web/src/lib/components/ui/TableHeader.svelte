<script lang="ts">
	import { isSort, type Order, type Sort } from '#lib/sorting.js';

	interface Props {
		sort?: Sort | null;
		order?: Order;
		col: string;
		/** Handle sort in place (e.g. inside a popover) instead of navigating to `?sort=`. */
		onSort?: ((params: URLSearchParams) => void) | null;
		class?: string;
		children?: import('svelte').Snippet;
	}

	let {
		sort = null,
		order = 'asc',
		col,
		onSort = null,
		class: klass = '',
		children,
	}: Props = $props();

	function onSortClick(event: MouseEvent) {
		if (!onSort || !sortLink) return;
		event.preventDefault();
		onSort(new URLSearchParams(sortLink.slice(1)));
	}

	let sortLink: string | null = $derived(
		!isSort(col)
			? null
			: sort === col
				? `?sort=${col}&order=${order === 'asc' ? 'desc' : 'asc'}`
				: `?sort=${col}`,
	);
	let sortClass = $derived(
		sort === col ? `table-sort-${order === 'asc' ? 'asc' : 'dsc'}` : '',
	);
</script>

<th class="{klass} {sortClass}">
	{#if sortLink}
		<a href={sortLink} onclick={onSortClick}>{@render children?.()}</a>
	{:else}
		{@render children?.()}
	{/if}
</th>
