<script lang="ts">
	import './app.css';

	import {
		faBookBookmark,
		faBug,
		faGaugeHigh,
		faGlobe,
		faHome,
		faNewspaper,
	} from '@fortawesome/free-solid-svg-icons';
	import { onMount } from 'svelte';
	import Fa from 'svelte-fa';

	import { browser } from '$app/env';
	import { page } from '$app/state';

	import { portal } from '#lib/actions/portal.js';
	import ConfirmDialog from '#lib/components/ui/ConfirmDialog.svelte';
	import Toaster from '#lib/components/ui/Toaster.svelte';
	import { browserTitle } from '#lib/utils.js';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	onMount(() => {
		document.body.classList.add('site-shell');
		return () => document.body.classList.remove('site-shell');
	});

	let title = $derived(
		typeof page.data.title === 'string' ? page.data.title : '',
	);
</script>

<svelte:head>
	<title>{browserTitle(title, { admin: true })}</title>
	<link
		rel="preload"
		href="/fonts/Inter-VariableFont_slnt,wght.ttf"
		as="font"
		type="font/ttf"
		crossorigin="anonymous" />
	<link
		rel="preload"
		href="/fonts/Quicksand.ttf"
		as="font"
		type="font/ttf"
		crossorigin="anonymous" />
</svelte:head>

{#if browser}
	<ConfirmDialog />
	<Toaster />
{/if}

<div
	class="hidden md:flex flex-row justify-center items-start fixed top-0 left-0 right-0"
	use:portal>
	<a
		class="flex gap-2 items-center justify-center rounded-b-lg px-4 py-1 bg-primary-800/75 text-white text-sm"
		href="/"
		data-sveltekit-reload
		data-sveltekit-preload-data="false"
		data-sveltekit-preload-code="false">
		Back to the site
		<Fa icon={faGlobe} />
	</a>
</div>

<div class="flex h-full w-full overflow-hidden">
	<aside class="w-56 flex-none overflow-y-auto bg-surface-500/5 p-4">
		<nav class="list-nav">
			<ul class="[&_a]:flex [&_a]:flex-row [&_a]:gap-2 [&_a]:items-center">
				<li><a href="/admin"><Fa icon={faHome} />Home</a></li>
				<li><a href="/admin/news"><Fa icon={faNewspaper} />News</a></li>
				<li>
					<a href="/admin/static-pages"
						><Fa icon={faBookBookmark} />Static Pages</a>
				</li>
				<li><a href="/admin/accounts">Accounts</a></li>
				<li><a href="/admin/players">Players</a></li>
				<li><a href="/admin/crashes"><Fa icon={faBug} />Crashes</a></li>
				<li><a href="/admin/telemetry"><Fa icon={faGaugeHigh} />Telemetry</a></li>
			</ul>
		</nav>
	</aside>
	<div
		class="flex max-w-5xl flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden">
		<div class="container mx-auto p-8 space-y-8">
			{@render children?.()}
		</div>
	</div>
</div>
