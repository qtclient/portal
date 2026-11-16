<script lang="ts">
	import { onMount } from 'svelte';

	import { pack } from '#lib/pack.js';

	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let visitorPlatform: string | null = $state(null);

	onMount(() => {
		const ua = navigator.userAgent;
		if (/Windows/i.test(ua)) visitorPlatform = 'windows-x64';
		else if (/Macintosh|Mac OS X/i.test(ua)) visitorPlatform = 'macos-arm64';
		else if (/Linux|X11/i.test(ua) && !/Android/i.test(ua))
			visitorPlatform = 'linux-x64';
	});

	function formatSize(bytes: number | null): string {
		if (!bytes) return '';
		const mb = bytes / (1024 * 1024);
		return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
	}

	const BUTTON_LABELS: Record<string, string> = {
		exe: 'Download installer',
		dmg: 'Download .dmg',
		appimage: 'Download AppImage',
		zip: 'Download .zip',
	};

	let available = $derived(data.platforms.filter((p) => p.url));

	const appName = pack.client.name;
</script>

<svelte:head>
	<title>Download — {appName}</title>
</svelte:head>

<div class="flex flex-col gap-4">
	<header class="flex flex-col gap-1">
		<h2 class="h2">Download {appName}</h2>
		<p class="text-sm opacity-80">
			Install the {appName} launcher, or
			<a href="/play" data-sveltekit-reload class="anchor"
				>play in the browser</a> without installing anything. The launcher downloads
			the game on first start and keeps it up to date.
		</p>
	</header>

	{#if available.length === 0}
		<div class="card card-tertiary p-4">
			<p>Desktop builds are not published yet.</p>
			<p class="text-sm opacity-70 mt-1">
				Meanwhile you can <a href="/play" data-sveltekit-reload class="anchor"
					>play in the browser</a
				>.
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
			{#each data.platforms as platform (platform.id)}
				{@const recommended = platform.id === visitorPlatform}
				<article
					class="card card-tertiary p-4 flex flex-col gap-2"
					class:ring-2={recommended}
					class:ring-primary-500={recommended}>
					<div class="flex flex-row justify-between items-baseline gap-2">
						<h3 class="h4 font-semibold">{platform.name}</h3>
						<span class="text-xs opacity-70">{platform.arch}</span>
					</div>
					{#if recommended}
						<span class="badge preset-filled-primary-500 self-start"
							>Your system</span>
					{/if}
					{#if platform.url}
						<a
							href={platform.url}
							class="btn {recommended
								? 'preset-filled-primary-500'
								: 'preset-tonal-secondary'} w-full"
							download={platform.file ?? true}>
							{BUTTON_LABELS[platform.format ?? 'zip'] ?? 'Download'}
						</a>
						<p class="text-xs opacity-70">
							{#if platform.file}<code>{platform.file}</code> ·{/if}
							{formatSize(platform.size)}
						</p>
						{#if platform.sha256}
							<details class="text-xs opacity-70">
								<summary class="cursor-pointer">SHA-256</summary>
								<code class="break-all">{platform.sha256}</code>
							</details>
						{/if}
						{#if platform.format === 'exe'}
							<p class="text-xs opacity-70">
								Run the installer (no administrator rights needed). If Windows
								SmartScreen warns about an unrecognized app, choose More info →
								Run anyway.
							</p>
						{:else if platform.format === 'dmg'}
							<p class="text-xs opacity-70">
								Open the .dmg and drag {appName} into Applications. If macOS says
								the app is damaged or blocked, clear quarantine then reopen:
								<code
									>xattr -dr com.apple.quarantine /Applications/{appName}.app</code
								>.
							</p>
						{:else if platform.format === 'zip' && platform.id === 'macos-arm64'}
							<p class="text-xs opacity-70">
								Unzip, move {appName}.app to Applications, then clear quarantine
								before opening:
								<code
									>xattr -dr com.apple.quarantine /Applications/{appName}.app</code
								>. Prefer the .dmg build when available.
							</p>
						{:else if platform.format === 'appimage'}
							<p class="text-xs opacity-70">
								Make it executable and run it:
								<code>chmod +x {platform.file}</code> then
								<code>./{platform.file}</code>. Needs FUSE (most desktops ship
								it).
							</p>
						{/if}
					{:else}
						<p class="text-sm opacity-60">Not available for this release.</p>
					{/if}
				</article>
			{/each}
		</div>
	{/if}

	{#if data.revision}
		<p class="text-xs opacity-60">
			Release <code>{data.revision}</code>
			{#if data.publishedAt}
				· published {formatDate(new Date(data.publishedAt))}
			{/if}
		</p>
	{/if}
</div>
