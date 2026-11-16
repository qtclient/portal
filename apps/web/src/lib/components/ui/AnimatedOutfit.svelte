<script lang="ts">
	import { OutfitAnimation } from '@qtc-aac/ui';

	import { browser } from '$app/env';

	import Spinner from '#lib/components/ui/Spinner.svelte';
	import { itemURL } from '#lib/items.js';
	import { outfitURL } from '#lib/players.js';

	type Outfit = {
		looktype: number;
		looktypeEx?: number | null;
		lookaddons?: number;
		lookhead?: number;
		lookbody?: number;
		looklegs?: number;
		lookfeet?: number;
		mount?: number | null;
		lookmount?: number | null;
	};

	interface Props {
		outfit: Outfit;
		alt: string;
		class?: string;
		innerClass?: string;
		children?: import('svelte').Snippet;
	}

	let {
		outfit,
		alt,
		class: klass = '',
		innerClass = '',
		children,
	}: Props = $props();

	let itemSrc = $state('');
	let itemState = $state<'loading' | 'ready' | 'error'>('loading');

	let hasMount = $derived(
		(outfit?.lookmount ?? 0) > 0 || (outfit?.mount ?? 0) > 0,
	);
	let useItem = $derived(
		(!outfit?.looktype || outfit.looktype <= 0) &&
			(outfit?.looktypeEx ?? 0) > 0,
	);
	let src = $derived(
		outfit?.looktype > 0
			? outfitURL({
					...outfit,
					mount: outfit.mount ?? outfit.lookmount ?? 0,
					resize: true,
				})
			: null,
	);

	$effect(() => {
		if (!browser || !useItem) return;
		let stale = false;
		itemSrc = '';
		itemState = 'loading';
		fetch(itemURL(outfit.looktypeEx!))
			.then((res) => {
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				return res.json();
			})
			.then((data: { src?: string }) => {
				if (stale) return;
				itemSrc = data.src ?? '';
				itemState = itemSrc ? 'ready' : 'error';
			})
			.catch(() => {
				if (!stale) itemState = 'error';
			});
		return () => {
			stale = true;
		};
	});
</script>

{#snippet failed()}
	<div class="w-8 h-8 rounded-full bg-surface-600/60" title={alt}></div>
{/snippet}

<div
	class="relative w-12 h-12 {klass} overflow-visible flex items-center justify-center">
	{@render children?.()}
	<div
		class="absolute inset-0 flex items-center justify-center pointer-events-none {hasMount
			? 'scale-90'
			: ''} {innerClass}">
		{#if !browser}
			{#if useItem || src}<Spinner />{/if}
		{:else if useItem}
			{#if itemState === 'ready'}
				<img src={itemSrc} {alt} class="w-10 h-10 object-contain" />
			{:else if itemState === 'loading'}
				<Spinner />
			{:else}
				{@render failed()}
			{/if}
		{:else if src}
			<OutfitAnimation
				{src}
				{alt}
				class="w-14 h-14 max-w-full max-h-full"
				fallback={failed}>
				{#snippet loading()}<Spinner />{/snippet}
			</OutfitAnimation>
		{/if}
	</div>
</div>
