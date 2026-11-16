<script lang="ts">
	import { Toast } from '@skeletonlabs/skeleton-svelte';

	import { toaster } from '#lib/toaster.js';

	const TONES: Record<string, string> = {
		success: 'bg-success-800! text-white!',
		error: 'bg-error-800! text-white!',
	};
</script>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast} class={TONES[toast.type ?? ''] ?? ''}>
			<Toast.Message>
				{#if toast.title}
					<Toast.Title>{toast.title}</Toast.Title>
				{/if}
				{#if toast.description}
					<Toast.Description>{toast.description}</Toast.Description>
				{/if}
			</Toast.Message>
			<Toast.CloseTrigger />
		</Toast>
	{/snippet}
</Toast.Group>
