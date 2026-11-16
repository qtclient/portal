<script lang="ts">
	import { pack } from '#lib/pack.js';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	const background = pack.site.background
		? `<style>body{--site-background:url('${pack.site.background.replace(/'/g, '%27')}')}</style>`
		: '';
</script>

<svelte:head>
	<link rel="icon" href={pack.site.favicon} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- pack config, not user input -->
	{@html background}
</svelte:head>

{@render children?.()}
