<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title?: string;
		class?: string;
		children?: Snippet;
	}

	let { title = '', class: className = '', children }: Props = $props();
</script>

<section class={`theme-box ${className}`.trim()}>
	{#if title}
		<header class="theme-box__title">{title}</header>
	{/if}
	<div class="theme-box__body">
		{@render children?.()}
	</div>
</section>

<style>
	.theme-box {
		border: 1px solid color-mix(in srgb, #8b6914 40%, transparent);
		border-radius: 0.35rem;
		background: color-mix(in srgb, #1a1208 12%, transparent);
		overflow: hidden;
	}
	.theme-box__title {
		padding: 0.4rem 0.75rem;
		font-weight: 600;
		font-size: 0.9rem;
		background: color-mix(in srgb, #5c4010 55%, #1a1208);
		color: #f4e8d0;
	}
	.theme-box__body {
		padding: 0.75rem 1rem;
	}
</style>
