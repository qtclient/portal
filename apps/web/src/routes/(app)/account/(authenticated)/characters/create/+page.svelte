<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { goto } from '$app/navigation';

	import Button from '#lib/components/ui/Button.svelte';
	import CreateCharacterFormFields from '#lib/components/ui/create-character/CreateCharacterFormFields.svelte';
	import StatelessModal from '#lib/components/ui/StatelessModal.svelte';
	import { enhance } from '#lib/enchance.js';

	import type { ActionData } from './$types';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();

	async function close() {
		await goto('/account', { reset: false });
	}
</script>

<StatelessModal title={$_('create-character')} onclose={close}>
	<form class="flex flex-col gap-4" method="post" use:enhance>
		{#if form?.errors?.global}
			<p class="text-xs text-error-500">{form.errors.global}</p>
		{/if}

		<CreateCharacterFormFields {form} />

		<div class="flex flex-row justify-end">
			<Button>{$_('create-character')}</Button>
		</div>
	</form>
</StatelessModal>
