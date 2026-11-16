<script lang="ts">
	import { pack } from '#lib/pack.js';
	import './app.css';

	import {
		faDiscord,
		faInstagram,
		faWhatsapp,
	} from '@fortawesome/free-brands-svg-icons';
	import {
		faBars,
		faBookBookmark,
		faToolbox,
	} from '@fortawesome/free-solid-svg-icons';
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';
	import { onDestroy, onMount } from 'svelte';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';
	import { getFlash } from 'sveltekit-flash-message/client';

	import { browser } from '$app/env';
	import * as publicEnv from '$app/env/public';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';

	import { portal } from '#lib/actions/portal.js';
	import BoostedSection from '#lib/components/ui/BoostedSection.svelte';
	import LightSwitch from '#lib/components/ui/LightSwitch.svelte';
	import ProgressBar from '#lib/components/ui/ProgressBar.svelte';
	import ServerStatus from '#lib/components/ui/ServerStatus.svelte';
	import SidebarLeft from '#lib/components/ui/SidebarLeft.svelte';
	import SidebarRight from '#lib/components/ui/SidebarRight.svelte';
	import Toaster from '#lib/components/ui/Toaster.svelte';
	import { isLoading } from '#lib/stores/loading.svelte.js';
	import { toaster } from '#lib/toaster.js';
	import { browserTitle, formatSeconds, secondsUntil } from '#lib/utils.js';

	import type { LayoutData } from './$types';

	const PUBLIC_DISCORD_URL = publicEnv.PUBLIC_DISCORD_URL ?? '';
	const PUBLIC_WHATSAPP_URL = publicEnv.PUBLIC_WHATSAPP_URL ?? '';
	const PUBLIC_INSTAGRAM_URL = publicEnv.PUBLIC_INSTAGRAM_URL ?? '';
	const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';
	const PUBLIC_WIKI_URL = publicEnv.PUBLIC_WIKI_URL ?? '';

	interface Props {
		data: LayoutData;
		children?: import('svelte').Snippet;
	}

	let { data, children }: Props = $props();

	let {
		highscores,
		isLoggedIn,
		boostedBoss,
		boostedCreature,
		isAdmin,
		accountCharacters,
	} = $derived(data);
	let title = $derived(
		typeof page.data.title === 'string' ? page.data.title : '',
	);
	let staticPages = $derived(data.staticPages);

	let drawerOpen = $state(false);

	const flash = getFlash(page);

	beforeNavigate((nav) => {
		if (nav.shallow) return;

		drawerOpen = false;
		if ($flash && nav.from?.url.toString() !== nav.to?.url.toString()) {
			$flash = undefined;
		}
	});

	const unsubscribe = flash.subscribe(($flash) => {
		if ($flash) {
			const { message, type: flashType } = $flash;
			toaster.create({
				title: message,
				type: flashType === 'success' ? 'success' : 'error',
			});
		}
	});
	onDestroy(unsubscribe);

	onMount(() => {
		document.body.classList.add('site-shell');
		return () => document.body.classList.remove('site-shell');
	});

	let nextServerSave = $state(formatSeconds(secondsUntil(data.nextServerSave)));

	setInterval(() => {
		nextServerSave = formatSeconds(secondsUntil(data.nextServerSave));
	}, 1000);
</script>

<svelte:head>
	<title>{browserTitle(title)}</title>
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
	<Toaster />
{/if}

{#if isAdmin}
	<div
		class="hidden md:flex flex-row justify-center items-start fixed top-0 left-0 right-0"
		use:portal>
		<a
			class="flex gap-2 items-center justify-center rounded-b-lg px-4 py-1 bg-error-800/75 text-white text-sm"
			href="/admin"
			data-sveltekit-reload
			data-sveltekit-preload-data="false"
			data-sveltekit-preload-code="false">
			Admin
			<Fa icon={faToolbox} />
		</a>
	</div>
{/if}

<Dialog open={drawerOpen} onOpenChange={(e) => (drawerOpen = e.open)}>
	<Portal>
		<Dialog.Backdrop
			class="fixed inset-0 z-40 bg-tertiary-900/50 backdrop-blur-xs" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex justify-start">
			<Dialog.Content
				class="h-full w-56 overflow-y-auto bg-tertiary-900/75 dark:bg-tertiary-800/75 shadow-xl">
				<div class="flex flex-col items-stretch gap-2 p-2 pt-4">
					<SidebarLeft {isLoggedIn} {staticPages} />

					<BoostedSection {boostedCreature} {boostedBoss} />

					<SidebarRight {accountCharacters} {highscores} />
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>

<div class="flex h-full w-full flex-col overflow-hidden">
	<header class="z-10 flex-none md:py-1">
		<div
			class="grid grid-cols-3 items-center gap-4 p-4 preset-filled-secondary-500 md:bg-transparent dark:md:bg-transparent">
			<div
				class="flex flex-none items-center justify-center transition-all md:w-48">
				<button
					class="md:hidden btn btn-sm mr-4"
					aria-label="Menu"
					onclick={() => (drawerOpen = true)}>
					<Fa icon={faBars} />
				</button>
				<div
					class="w-full h-full -mb-6 hidden md:flex flex-col items-center justify-end">
					{#if pack.site.logo}
						<img
							src={pack.site.logo}
							alt={PUBLIC_TITLE}
							class="hidden md:block w-44 h-auto object-contain" />
					{:else}
						<span class="hidden md:block text-2xl font-bold tracking-wide"
							>{PUBLIC_TITLE || 'qtc-aac'}</span>
					{/if}
				</div>
			</div>
			<div class="flex-auto place-self-center">
				<div class="flex md:hidden items-center gap-2">
					{#if pack.site.logo}
						<img
							src={pack.site.logo}
							alt={PUBLIC_TITLE}
							class="h-10 w-auto max-w-[10rem] object-contain -my-2" />
					{:else}
						<span class="text-lg font-bold">{PUBLIC_TITLE || 'qtc-aac'}</span>
					{/if}
				</div>
			</div>
			<div class="flex flex-none flex-col items-end! justify-end md:h-full">
				<div class="hidden md:block w-48">
					<BoostedSection {boostedCreature} {boostedBoss} />
				</div>
				<div class="block md:hidden">
					<LightSwitch />
				</div>
			</div>
		</div>
	</header>
	<div class="flex h-full w-full flex-auto overflow-hidden">
		<aside class="w-0 flex-none overflow-y-auto overflow-x-hidden md:w-56">
			<nav class="mx-4 mt-2 flex flex-col gap-2">
				<SidebarLeft {isLoggedIn} {staticPages} />

				<nav class="hidden md:flex lg:hidden mx-4 mt-2 flex-col gap-2 pt-4">
					<SidebarRight {accountCharacters} {highscores} />
				</nav>
			</nav>
		</aside>
		<div class="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
			<header class="flex-none">
				<div
					class="hidden md:mr-2 lg:mr-0 md:flex mt-2 items-center justify-between gap-4 py-2 pl-2 pr-1 text-white text-xs rounded-container bg-secondary-500">
					<span class="flex flex-row gap-2">
						<a
							href={PUBLIC_DISCORD_URL}
							target="_blank"
							rel="noreferrer"
							class="flex flex-row items-center gap-1">
							<Fa icon={faDiscord} />
							{$_('layout.join_discord')}
						</a>
						{#if PUBLIC_WHATSAPP_URL}
							<a
								href={PUBLIC_WHATSAPP_URL}
								target="_blank"
								rel="noreferrer"
								class="flex flex-row items-center gap-1">
								<Fa icon={faWhatsapp} />
								{$_('layout.join_whatsapp')}
							</a>
						{/if}
						{#if PUBLIC_INSTAGRAM_URL}
							<a
								href={PUBLIC_INSTAGRAM_URL}
								target="_blank"
								rel="noreferrer"
								class="flex flex-row items-center gap-1">
								<Fa icon={faInstagram} />
								{$_('layout.follow_instagram')}
							</a>
						{/if}
						{#if PUBLIC_WIKI_URL}
							<a
								href={PUBLIC_WIKI_URL}
								target="_blank"
								rel="noreferrer"
								class="flex flex-row items-center gap-1">
								<Fa icon={faBookBookmark} />
								{$_('layout.wiki')}
							</a>
						{/if}
					</span>
					<span class="flex items-center gap-2">
						<div>{$_('layout.next_server_save')} {nextServerSave}</div>
						<ServerStatus />
						<LightSwitch />
					</span>
				</div>
			</header>

			<main class="flex-auto">
				<div
					class="mx-2 md:ml-0 lg:mx-0 my-2 card card-surface theme-box transition-all">
					{#if title.length > 0}
						<div
							class="rounded-container px-4 py-1 bg-tertiary-900 text-warning-400">
							<h4 class="h4">{title}</h4>
						</div>
					{/if}

					<div
						class="px-4 pt-2 pb-2 overflow-y-auto flex flex-col items-center">
						{@render children?.()}
					</div>
				</div>
			</main>

			<footer class="flex-none">
				<div class="flex-flex-row justify-center items-center">
					<div
						class="m-auto mb-2 w-fit px-4 text-white font-extralight bg-slate-600/75 rounded-full text-sm">
						© {new Date().getFullYear()}
						{PUBLIC_TITLE || 'qtc-aac'}
					</div>
				</div>
			</footer>
		</div>
		<aside class="w-0 flex-none overflow-y-auto overflow-x-hidden lg:w-56">
			<nav class="mx-4 mt-2 flex flex-col gap-2">
				<SidebarRight {accountCharacters} {highscores} />
			</nav>
		</aside>
	</div>
</div>

{#if isLoading()}
	<ProgressBar infinite />
{/if}
