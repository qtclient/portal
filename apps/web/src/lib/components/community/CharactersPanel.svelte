<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { _ } from 'svelte-i18n';

	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import type { Player } from '#lib/players.js';
	import CharactersTable from '#lib/components/ui/CharactersTable.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import { debounce } from '#lib/utils.js';

	interface Props {
		context?: CommunityPanelContext;
	}

	let { context = 'page' }: Props = $props();

	let search = $state('');
	let results: Player[] = $state([]);
	let loading = $state(false);

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);

	async function runSearch(query: string) {
		if (query.length < 1) {
			results = [];
			return;
		}
		loading = true;
		try {
			const response = await fetch(
				`/api/search/characters?q=${encodeURIComponent(query)}`,
			);
			const payload = (await response.json()) as { results: Player[] };

			results = payload.results ?? [];
		} catch {
			results = [];
		} finally {
			loading = false;
		}
	}

	const debouncedSearch = debounce((query: string) => {
		if (context === 'page' && browser) {
			const params = new URLSearchParams();
			if (query) {
				params.set('search', query);
			}
			const qs = params.toString();
			void goto(qs ? `/characters?${qs}` : '/characters', {
				replace: true,
				reset: false,
			});
		}
		void runSearch(query);
	}, 200);

	function onSearchInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		search = value;
		void debouncedSearch(value.trim());
	}

	function reset() {
		search = '';
		results = [];
	}

	onMount(() => {
		if (context !== 'page') {
			return;
		}
		const initial = page.url.searchParams.get('search')?.trim();
		if (initial) {
			search = initial;
			void runSearch(initial);
		}
	});
</script>

<div class="flex flex-col items-center gap-2 w-full max-w-4xl">
	<TextField
		label={$_('character-name')}
		type="search"
		name="search"
		variant="horizontal"
		placeholder={$_('search')}
		bind:value={search}
		oninput={onSearchInput} />

	{#if loading}
		<p class="text-sm opacity-75">{$_('search')}...</p>
	{:else if results.length > 0}
		<div transition:slide>
			<CharactersTable
				characters={results}
				{linkTarget}
				{linkRel}
				onselected={reset} />
		</div>
	{/if}
</div>
