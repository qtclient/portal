<script lang="ts">
	import { browser } from '$app/env';

	import Tip from '#lib/components/ui/Tip.svelte';
	import { fetchBackground, fetchItem } from '#lib/items.js';
	import { toProperCase } from '#lib/utils.js';

	interface Props {
		item: number | string;
	}

	let { item }: Props = $props();

	let image = $state({ src: '', alt: '' });
	let emptyBg = $state('');

	$effect(() => {
		if (browser && item) {
			void (async function () {
				const itemData = await fetchItem(item);
				const bg = await fetchBackground();

				image = itemData;
				emptyBg = `url(${bg.src})`;
			})();
		} else {
			image = { src: '', alt: '' };
			emptyBg = '';
		}
	});
</script>

<div class="w-9 h-9 rounded-xs bg-surface-500 flex justify-center items-center">
	<div style:--bg={emptyBg} class="item-image">
		{#key image.src}
			{#if image.src !== ''}
				<Tip content={toProperCase(image.alt) ?? 'None'}>
					{#snippet trigger(attrs)}
						<img {...attrs} src={image.src} alt={image.alt} />
					{/snippet}
				</Tip>
			{/if}
		{/key}
	</div>
</div>

<style scoped>
	.item-image {
		background-image: var(--bg);
	}
</style>
