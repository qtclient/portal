<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		/** CSS length for the circle diameter. */
		size?: string;
		track?: string;
		range?: string;
	}

	let { size = '2rem', track = '', range = '' }: Props = $props();
</script>

<Progress value={null} class="w-fit">
	<Progress.Circle style="--size: {size}">
		<Progress.CircleTrack class={track} />
		<Progress.CircleRange class={range} />
	</Progress.Circle>
</Progress>
