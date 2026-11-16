<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';
	import Select from '#lib/components/ui/forms/Select.svelte';
	import { PlayerSex } from '#lib/players.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let sex = $state(String(data.player?.sex ?? PlayerSex.Male));
</script>

{#if !data.enabled}
	<p>{$_('character-change-sex.disabled')}</p>
{:else}
	<form method="post" class="flex flex-col gap-4 max-w-md w-full">
		<p>
			{$_('character-change-sex.description', {
				values: { price: data.price, name: data.player?.name },
			})}
		</p>
		{#if data.player?.online}
			<p class="text-error-500 text-sm">
				{$_('character-change-sex.must-be-offline')}
			</p>
		{/if}
		<Select name="sex" label={$_('sex')} bind:value={sex}>
			<option value={PlayerSex.Male}>{$_('sexes.male')}</option>
			<option value={PlayerSex.Female}>{$_('sexes.female')}</option>
		</Select>
		<Button type="submit" disabled={data.player?.online}>
			{$_('character-change-sex.submit')}
		</Button>
	</form>
{/if}
