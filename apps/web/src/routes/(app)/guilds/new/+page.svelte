<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';
	import Select from '#lib/components/ui/forms/Select.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import { enhance } from '#lib/enchance.js';
	import { toTitleCase } from '#lib/utils.js';

	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let name = $state('');
	$effect(() => {
		name = toTitleCase(name);
	});

	let characters = $derived(
		(data.accountCharacters ?? []).filter((character) => !character.guild),
	);
</script>

<form class="flex flex-col gap-4" method="post" use:enhance>
	{#if form?.errors?.global}
		<p class="text-xs text-error-500">{form.errors.global}</p>
	{/if}

	<div class="flex flex-row gap-2">
		<Select
			name="leader"
			labelClass="min-w-[12rem]"
			label={$_('character')}
			errors={form?.errors?.leader}>
			{#each characters as character}
				<option value={character.id}>
					{character.name}
				</option>
			{/each}
		</Select>

		<TextField
			required
			label={$_('guilds.guild-name')}
			name="name"
			bind:value={name}
			errors={form?.errors?.name} />
	</div>

	<div class="flex flex-row justify-end">
		<Button>
			{$_('guilds.create-butotn')}
		</Button>
	</div>
</form>
