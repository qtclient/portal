<script lang="ts">
	import CharactersPanel from '#lib/components/community/CharactersPanel.svelte';

	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="flex flex-col items-center gap-2">
	{@render children?.()}
	<CharactersPanel context="page" />
</div>
