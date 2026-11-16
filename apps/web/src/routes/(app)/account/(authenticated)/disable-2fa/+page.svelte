<script lang="ts">
	import { goto } from '$app/navigation';

	import StatelessModal from '#lib/components/ui/StatelessModal.svelte';

	import type { ActionData, PageData } from './$types';

	async function close() {
		await goto('/account', { reset: false });
	}
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';
	import Disable2FaForm from '#lib/components/ui/forms/Disable2FAForm.svelte';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

<StatelessModal title={$_('enable-2fa')} onclose={close}>
	{#if !data.enabled}
		<h3 class="h3">Success!</h3>
		<p>{$_('disable-2fa.success')}</p>
		<p></p>
		<div class="flex flex-col items-center gap-4">
			<Button href="/account" color="secondary">{$_('close')}</Button>
		</div>
	{:else}
		<Disable2FaForm errors={form?.errors} />
	{/if}
</StatelessModal>
