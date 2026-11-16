<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		display?: 'inline-flex' | 'flex-col';
		children: Snippet;
	}

	let { display = 'inline-flex', children }: Props = $props();
</script>

<div
	role="radiogroup"
	class="{display === 'flex-col'
		? 'flex flex-col'
		: 'inline-flex flex-wrap'} gap-1 rounded-container border border-surface-500/30 bg-surface-200 p-1 dark:bg-surface-800">
	{@render children()}
</div>
