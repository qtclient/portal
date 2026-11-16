<script lang="ts">
	import * as publicEnv from '$app/env/public';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}
	let { data }: Props = $props();
</script>

<svelte:head>
	<title>Community — {publicEnv.PUBLIC_TITLE ?? 'qtc-aac'}</title>
</svelte:head>

<section class="content-box mx-auto max-w-2xl px-4 py-12 text-center">
	<h1 class="text-2xl font-semibold">Community</h1>
	<p class="mt-3 text-sm opacity-70">
		{#if data.subtopic}
			Topic “{data.subtopic}” is coming soon.
		{:else}
			Choose a community page from the menu.
		{/if}
	</p>
</section>
