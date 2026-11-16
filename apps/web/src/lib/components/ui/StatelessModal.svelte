<script lang="ts">
	import { faClose } from '@fortawesome/free-solid-svg-icons';
	import { fade, scale } from 'svelte/transition';
	import Fa from 'svelte-fa';

	import { portal } from '#lib/actions/portal.js';

	function close() {
		onclose?.();
	}

	interface Props {
		onclose?: () => void;
		title: string;
		children?: import('svelte').Snippet;
	}

	let { title, children, onclose }: Props = $props();

	$effect(() => {
		document.body.classList.add('overflow-hidden');
		return () => document.body.classList.remove('overflow-hidden');
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	class="modal-backdrop fixed inset-0 bg-surface-400/70 dark:bg-surface-900/70 w-full h-full flex items-center justify-center"
	onclick={(event) => event.target === event.currentTarget && close()}
	onkeypress={(e) => e.key === 'Escape' && close()}
	transition:fade
	use:portal={'body'}>
	<div
		class="modal flex flex-col bg-surface-100 dark:bg-surface-800 w-modal h-auto max-h-full overflow-hidden p-4 space-y-4 rounded-container shadow-xl transition-all duration-300"
		role="dialog"
		transition:scale
		aria-modal="true"
		aria-label={title}>
		<header
			class="text-2xl font-bold flex flex-row justify-between items-center">
			{title}
			<button onclick={close}><Fa icon={faClose} size="xs" /></button>
		</header>
		<div class="flex flex-col gap-2 h-auto overflow-y-auto">
			{@render children?.()}
		</div>
	</div>
</dialog>
