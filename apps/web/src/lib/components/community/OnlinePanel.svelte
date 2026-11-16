<script lang="ts">
	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import type { Player } from '#lib/players.js';
	import type { Order, Sort } from '#lib/sorting.js';
	import CharactersTable from '#lib/components/ui/CharactersTable.svelte';

	interface Props {
		onparamschange?: (detail: URLSearchParams) => void;
		data: {
			characters: Player[];
			sort: Sort;
			order: Order;
		};
		context?: CommunityPanelContext;
	}

	let { data, context = 'page', onparamschange }: Props = $props();

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);
	let onSort = $derived(
		context === 'overlay'
			? (params: URLSearchParams) => onparamschange?.(params)
			: null,
	);
</script>

<div class="flex flex-col gap-2">
	<CharactersTable
		characters={data.characters}
		sort={data.sort}
		order={data.order}
		{linkTarget}
		{linkRel}
		{onSort} />
</div>
