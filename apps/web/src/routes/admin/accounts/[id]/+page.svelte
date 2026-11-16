<script lang="ts">
	import { AccountType } from '#lib/accounts.js';
	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#if data.account}
	<form method="post" class="flex flex-col gap-3 max-w-lg">
		<TextField name="email" label="Email" value={data.account.email} required />
		<label class="flex flex-col gap-1">
			<span class="text-sm">Account type</span>
			<select class="select" name="type" value={data.account.type}>
				<option value={AccountType.Normal}>Normal</option>
				<option value={AccountType.Tutor}>Tutor</option>
				<option value={AccountType.SeniorTutor}>Senior Tutor</option>
				<option value={AccountType.GameMaster}>Game Master</option>
				<option value={AccountType.God}>God</option>
			</select>
		</label>
		<TextField
			name="coins"
			label="Coins"
			type="number"
			value={String(data.account.coins)} />
		<TextField
			name="coins_transferable"
			label="Transferable coins"
			type="number"
			value={String(data.account.coins_transferable)} />
		<TextField
			name="premiumDays"
			label="Premium days"
			type="number"
			value={String(data.account.premiumDays)} />
		<label class="flex items-center gap-2">
			<input
				type="checkbox"
				name="is_verified"
				checked={data.account.is_verified} />
			Verified
		</label>
		<TextField
			name="newPassword"
			label="New password (optional)"
			type="password" />
		<Button type="submit">Save account</Button>
	</form>
{/if}
