<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		steps: number;
		current?: number;
		label?: string;
		children?: import('svelte').Snippet;
	}

	let { steps, current = 0, label = $_('step'), children }: Props = $props();
</script>

<div class="stepper space-y-4">
	<header
		class="stepper-header flex items-center border-t mt-[15px] border-surface-400 dark:border-surface-500 gap-4">
		{#each Array.from({ length: steps }) as _, i}
			<div
				class="stepper-header-step -mt-[15px] transition-all duration-300 flex-1"
				class:flex-1={i === current}>
				<span
					class="badge {i === current
						? 'preset-filled'
						: 'preset-filled-surface-500'}"
					>{i + 1}{i === current ? `. ${label}` : ''}</span>
			</div>
		{/each}
	</header>
	<div class="stepper-content">
		<div class="step space-y-4">
			<div class="step-content space-y-4">
				{@render children?.()}
			</div>
		</div>
	</div>
</div>
