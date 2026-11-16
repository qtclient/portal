<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#if !data.enabled}
	<p>{$_('character-rename.disabled')}</p>
{:else}
	<form method="post" class="flex flex-col gap-4 max-w-md w-full">
		<p>
			{$_('character-rename.description', {
				values: { price: data.price, name: data.player?.name },
			})}
		</p>
		{#if data.player?.online}
			<p class="text-error-500 text-sm">
				{$_('character-rename.must-be-offline')}
			</p>
		{/if}
		<TextField
			name="newName"
			label={$_('character-rename.new-name')}
			required />
		<Button type="submit" disabled={data.player?.online}>
			{$_('character-rename.submit')}
		</Button>
	</form>
{/if}
