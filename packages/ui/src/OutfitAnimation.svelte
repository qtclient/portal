<script lang="ts">
	import type { Snippet } from 'svelte';

	import {
		type FetchLike,
		loadOutfitFrames,
		type OutfitFrame,
	} from './outfit.js';

	interface Props {
		/** `/api/outfits?...` URL (absolute outside the website). */
		src: string;
		alt: string;
		fetch?: FetchLike;
		class?: string;
		loading?: Snippet;
		fallback?: Snippet;
	}

	let {
		src,
		alt,
		fetch: fetchFn,
		class: klass = '',
		loading,
		fallback,
	}: Props = $props();

	let frames = $state.raw<OutfitFrame[]>([]);
	let status = $state<'loading' | 'ready' | 'error'>('loading');
	let canvas = $state<HTMLCanvasElement | null>(null);

	$effect(() => {
		let stale = false;
		status = 'loading';
		frames = [];
		loadOutfitFrames(src, fetchFn)
			.then((loaded) => {
				if (stale) return;
				frames = loaded;
				status = loaded.length ? 'ready' : 'error';
			})
			.catch(() => {
				if (!stale) status = 'error';
			});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		const ctx = canvas?.getContext('2d');
		if (!canvas || !ctx || frames.length === 0) return;
		const target = canvas;
		let index = 0;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const draw = () => {
			const { image, duration } = frames[index];
			if (target.width !== image.width || target.height !== image.height) {
				target.width = image.width || 64;
				target.height = image.height || 64;
			}
			ctx.clearRect(0, 0, target.width, target.height);
			ctx.drawImage(image, 0, 0);
			if (frames.length > 1) {
				index = (index + 1) % frames.length;
				timer = setTimeout(draw, Math.max(duration || 100, 16));
			}
		};
		draw();
		return () => clearTimeout(timer);
	});
</script>

{#if status === 'ready'}
	<canvas bind:this={canvas} class={klass} aria-label={alt}></canvas>
{:else if status === 'loading'}
	{@render loading?.()}
{:else}
	{@render fallback?.()}
{/if}
