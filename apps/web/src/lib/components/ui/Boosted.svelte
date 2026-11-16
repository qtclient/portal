<script lang="ts">
	import { faBolt, faSkull } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';

	import type { BoostedProps } from '#lib/boosted.js';
	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import Tip from '#lib/components/ui/Tip.svelte';
	import { toProperCase } from '#lib/utils.js';

	interface Props {
		kind?: 'boss' | 'creature';
		boosted?: BoostedProps | null;
	}

	let { kind = 'boss', boosted = null }: Props = $props();

	let hasSprite = $derived(
		Boolean(boosted) &&
			((boosted!.looktype ?? 0) > 0 || (boosted!.looktypeEx ?? 0) > 0),
	);
</script>

{#if boosted}
	<Tip content={`Boosted ${toProperCase(kind)}: ${boosted.boostname ?? ''}`}>
		{#snippet trigger(attrs)}
			<div
				{...attrs}
				class="transition-all ease-in-out duration-300 hover:scale-110 bg-surface-400/70 dark:bg-surface-900/70 p-2 border-2 border-warning-500 ring-2 ring-primary-600/50 rounded-base shadow-md relative w-[4.25rem] h-[4.25rem] flex items-center justify-center overflow-visible">
				{#if !hasSprite}
					<Fa
						class="text-surface-900 dark:text-surface-50 opacity-40"
						icon={kind === 'boss' ? faSkull : faBolt}
						size="2x" />
				{:else}
					<!-- Neutral plate so sparse / effect outfits stay visible -->
					<div
						class="absolute inset-2 rounded-full bg-surface-200/70 dark:bg-surface-700/70 ring-1 ring-surface-300/30">
					</div>
					<div class="relative z-10 scale-[1.35]">
						<AnimatedOutfit outfit={boosted} alt={boosted.boostname ?? ''} />
					</div>
				{/if}
				<div
					class="absolute inset-x-0 -bottom-4 flex items-center justify-center h-8 z-20">
					<span
						class="rounded-full bg-warning-500 ring-2 ring-primary-600/50 p-0.5">
						<Fa
							class="text-success-500"
							icon={kind === 'boss' ? faSkull : faBolt}
							size="0.75x" />
					</span>
				</div>
			</div>
		{/snippet}
	</Tip>
{/if}
