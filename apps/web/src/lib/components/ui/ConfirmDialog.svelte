<script lang="ts">
	import { Dialog, Portal } from '@skeletonlabs/skeleton-svelte';

	import { pendingConfirm, settleConfirm } from '#lib/confirm.svelte.js';

	let request = $derived(pendingConfirm());
</script>

<Dialog
	open={request !== null}
	onOpenChange={(e) => {
		if (!e.open) settleConfirm(false);
	}}>
	<Portal>
		<Dialog.Backdrop class="fixed inset-0 z-40 bg-surface-900/70" />
		<Dialog.Positioner
			class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content
				class="card w-full max-w-md space-y-4 bg-surface-100 p-4 shadow-xl dark:bg-surface-800">
				<Dialog.Title class="h3">{request?.title}</Dialog.Title>
				<Dialog.Description>{request?.body}</Dialog.Description>
				<footer class="flex justify-end gap-2">
					<button
						type="button"
						class="btn preset-tonal"
						onclick={() => settleConfirm(false)}>
						Cancel
					</button>
					<button
						type="button"
						class="btn preset-filled-error-500"
						onclick={() => settleConfirm(true)}>
						Confirm
					</button>
				</footer>
			</Dialog.Content>
		</Dialog.Positioner>
	</Portal>
</Dialog>
