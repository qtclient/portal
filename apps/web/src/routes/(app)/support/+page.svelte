<script lang="ts">
	import * as publicEnv from '$app/env/public';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}
	let { data }: Props = $props();

	const email = publicEnv.PUBLIC_SUPPORT_EMAIL || '';
</script>

<svelte:head>
	<title>Support — {publicEnv.PUBLIC_TITLE ?? 'qtc-aac'}</title>
</svelte:head>

<section class="content-box mx-auto max-w-2xl px-4 py-12">
	<h1 class="text-2xl font-semibold">Support</h1>
	{#if data.legal}
		<p class="mt-3 text-sm opacity-80">
			This document has not been published yet.
		</p>
	{:else if data.subtopic === 'tibiarules'}
		<p class="mt-3 text-sm opacity-80">
			Be respectful, no cheating, no real-money trading of game accounts outside
			official channels. Full rules coming soon.
		</p>
	{:else if data.subtopic === 'contact'}
		<p class="mt-3 text-sm opacity-80">
			{#if email}
				Contact us at <a class="underline" href={`mailto:${email}`}>{email}</a>.
			{:else}
				Contact details coming soon.
			{/if}
		</p>
	{:else}
		<p class="mt-3 text-sm opacity-80">
			FAQ content is being prepared. For account issues use Lost Account in the
			menu.
		</p>
	{/if}
</section>
