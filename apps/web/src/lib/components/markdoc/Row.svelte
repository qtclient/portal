<script lang="ts">
	interface Props {
		center?: boolean;
		children?: import('svelte').Snippet;
	}

	let { center = false, children }: Props = $props();
</script>

<div
	class="flex flex-row gap-2"
	class:items-center={center}
	class:justify-center={center}>
	{@render children?.()}
</div>
