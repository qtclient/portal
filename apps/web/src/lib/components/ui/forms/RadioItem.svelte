<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';

	interface Props {
		group: T;
		name: string;
		value: T;
		children: Snippet;
	}

	let { group = $bindable(), name, value, children }: Props = $props();
</script>

<label
	class="flex flex-auto cursor-pointer items-center justify-center rounded-base px-4 py-1 transition-colors hover:bg-primary-500/10 has-checked:preset-filled-primary-500 has-focus-visible:outline-2 has-focus-visible:outline-primary-500">
	<input class="sr-only" type="radio" bind:group {name} {value} />
	{@render children()}
</label>
