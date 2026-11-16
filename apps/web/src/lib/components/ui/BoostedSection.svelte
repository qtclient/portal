<script lang="ts">
	import type { BoostedProps } from '#lib/boosted.js';
	import Boosted from '#lib/components/ui/Boosted.svelte';

	interface Props {
		boostedCreature: BoostedProps | null;
		boostedBoss: BoostedProps | null;
	}

	let { boostedCreature, boostedBoss }: Props = $props();
</script>

<div class="flex flex-col-reverse items-center gap-2 mt-4 md:mt-0 md:-mb-4">
	<div class="flex flex-row gap-8">
		<Boosted boosted={boostedCreature} kind="creature" />
		<Boosted boosted={boostedBoss} kind="boss" />
	</div>
</div>
