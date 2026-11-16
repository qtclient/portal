<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';
	import CreateCharacterFormFields from '#lib/components/ui/create-character/CreateCharacterFormFields.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import { enhance } from '#lib/enchance.js';

	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

<form class="flex flex-col gap-4" method="post" use:enhance>
	{#if form?.errors?.global}
		<p class="text-xs text-error-500">{form.errors.global}</p>
	{/if}

	{#if data.ref}
		<input type="hidden" name="ref" value={data.ref} />
		<p class="text-sm opacity-70">{$_('referral.signup-note')}</p>
	{/if}

	<TextField
		required
		label={$_('email')}
		name="email"
		type="email"
		autocomplete="email"
		errors={form?.errors?.email} />

	<div class="flex flex-row gap-2">
		<TextField
			required
			label={$_('password')}
			name="password"
			type="password"
			autocomplete="new-password"
			errors={form?.errors?.password} />

		<TextField
			required
			label={$_('password-confirmation')}
			name="passwordConfirmation"
			type="password"
			autocomplete="new-password"
			errors={form?.errors?.passwordConfirmation} />
	</div>

	<hr class="divider" />

	<h3 class="h3">{$_('character')}</h3>

	<CreateCharacterFormFields {form} />

	<div class="flex flex-row justify-end">
		<Button>{$_('create-account')}</Button>
	</div>
</form>
