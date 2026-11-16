<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		content?: string | null;
		placement?: 'top' | 'bottom' | 'left' | 'right';
		/** Renders the anchor element; spread `attrs` onto it. */
		trigger: Snippet<[Record<string, unknown>]>;
	}

	let { content = null, placement = 'top', trigger }: Props = $props();
</script>

{#if content}
	<Tooltip openDelay={150} closeDelay={0} positioning={{ placement }}>
		<Tooltip.Trigger element={trigger} />
		<Portal>
			<Tooltip.Positioner class="z-50">
				<Tooltip.Content
					class="card bg-surface-900 text-surface-100 px-2.5 py-1.5 shadow-lg">
					{content}
				</Tooltip.Content>
			</Tooltip.Positioner>
		</Portal>
	</Tooltip>
{:else}
	{@render trigger({})}
{/if}
