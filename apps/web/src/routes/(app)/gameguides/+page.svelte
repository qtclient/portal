<script lang="ts">
	import * as publicEnv from '$app/env/public';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}
	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Game Guides — {publicEnv.PUBLIC_TITLE ?? 'qtc-aac'}</title>
</svelte:head>

<section class="content-box mx-auto max-w-2xl px-4 py-12">
	<h1 class="text-2xl font-semibold">Game Guides</h1>
	<p class="mt-3 text-sm opacity-80">
		{#if data.subtopic === 'manual'}
			The player manual is being rewritten. Use in-game help and the wiki (when
			linked) meanwhile.
		{:else}
			Guide “{data.subtopic}” is coming soon.
		{/if}
	</p>
</section>
