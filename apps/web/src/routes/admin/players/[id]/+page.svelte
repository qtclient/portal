<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import { PlayerGroup, PlayerVocation } from '#lib/players.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#if data.player}
	<form method="post" class="flex flex-col gap-3 max-w-lg">
		<p class="text-sm opacity-75">Account: {data.player.account.email}</p>
		<TextField name="name" label="Name" value={data.player.name} required />
		<TextField
			name="level"
			label="Level"
			type="number"
			value={String(data.player.level)} />
		<label class="flex flex-col gap-1">
			<span class="text-sm">Vocation</span>
			<select class="select" name="vocation" value={data.player.vocation}>
				{#each Object.entries(PlayerVocation).filter( ([k]) => isNaN(Number(k)) ) as [label, value]}
					<option {value}>{label}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-1">
			<span class="text-sm">Group</span>
			<select class="select" name="group_id" value={data.player.group_id}>
				<option value={PlayerGroup.Normal}>Normal</option>
				<option value={PlayerGroup.Tutor}>Tutor</option>
				<option value={PlayerGroup.Seniortutor}>Senior Tutor</option>
				<option value={PlayerGroup.Gamemaster}>Gamemaster</option>
				<option value={PlayerGroup.Communitymanager}>Community Manager</option>
				<option value={PlayerGroup.God}>God</option>
			</select>
		</label>
		<Button type="submit">Save player</Button>
	</form>
{/if}
