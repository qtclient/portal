<script lang="ts">
	import { pack } from '#lib/pack.js';
	import * as publicEnv from '$app/env/public';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}
	let { data }: Props = $props();
</script>

<svelte:head>
	<title>About — {publicEnv.PUBLIC_TITLE ?? 'qtc-aac'}</title>
</svelte:head>

<section class="content-box mx-auto max-w-2xl px-4 py-12">
	<h1 class="text-2xl font-semibold">
		About {publicEnv.PUBLIC_TITLE ?? 'qtc-aac'}
	</h1>
	<p class="mt-3 text-sm opacity-80">
		{#if data.subtopic === 'premiumfeatures'}
			Premium features unlock faster progress and exclusive cosmetics. Details
			coming soon.
		{:else}
			{pack.site.tagline ??
				'An Open Tibia server. Play in the browser or with the desktop client.'}
		{/if}
	</p>
	<p class="mt-6">
		<a class="btn preset-filled-primary-500" href="/play" data-sveltekit-reload
			>Play</a>
		<a class="btn preset-tonal ml-2" href="/download">Download</a>
	</p>
</section>
