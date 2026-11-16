<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import { enhance } from '#lib/enchance.js';

	interface Props {
		errors: Record<string, string[]> | undefined;
	}

	let { errors }: Props = $props();
</script>

<form class="flex flex-col gap-6" method="post" use:enhance>
	{#if errors?.global}
		<p class="text-xs text-error-500">{errors.global}</p>
	{/if}

	<div class="flex flex-wrap gap-4 items-center justify-center">
		<p>
			{$_('disable-2fa.description')}
		</p>
	</div>

	<div class="flex flex-wrap gap-4 items-center">
		<TextField
			required
			label={$_('password')}
			name="password"
			type="password"
			autocomplete="current-password"
			errors={errors?.password} />
		<TextField
			required
			label={$_('token')}
			name="token"
			type="number"
			autocomplete="one-time-code"
			errors={errors?.token} />
	</div>

	<div class="flex flex-row justify-end">
		<Button>{$_('disable-2fa.button')}</Button>
	</div>
</form>
