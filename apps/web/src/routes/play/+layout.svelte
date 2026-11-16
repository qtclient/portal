<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	onMount(() => {
		document.documentElement.classList.add('play-mode');
		return () => document.documentElement.classList.remove('play-mode');
	});
</script>

{@render children?.()}

<style>
	/* First-paint full-bleed before play-mode class is added in onMount. */
	:global(body:has(.play-root)),
	:global(html:has(.play-root)),
	:global(html.play-mode),
	:global(html.play-mode body) {
		overflow: hidden !important;
		height: 100%;
		height: 100dvh;
		margin: 0;
		background: #0b0e12 !important;
		background-image: none !important;
	}

	:global(body:has(.play-root) > .backdrop),
	:global(html.play-mode body > .backdrop) {
		display: none;
	}

	:global(body:has(.play-root) .main-content),
	:global(html.play-mode .main-content) {
		position: fixed;
		inset: 0;
		max-width: none;
		width: 100%;
		height: 100%;
		height: 100dvh;
		margin: 0;
		overflow: hidden;
	}
</style>
