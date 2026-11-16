<script lang="ts">
	import Button from '#lib/components/ui/Button.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<form method="get" class="flex gap-2 items-end mb-4">
	<label class="flex flex-col gap-1">
		<span class="text-sm">Search character name</span>
		<input class="input" type="search" name="q" value={data.q} />
	</label>
	<Button type="submit" size="sm">Search</Button>
</form>

{#if data.players.length > 0}
	<div class="table-wrap">
		<table class="table table-hover table-auto">
			<thead>
				<tr class="[&>th]:!p-2">
					<th>Name</th>
					<th>Level</th>
					<th>Group</th>
					<th>Account</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.players as player}
					<tr class="[&>td]:!p-2">
						<td>{player.name}</td>
						<td>{player.level}</td>
						<td>{player.group_id}</td>
						<td>{player.account.email}</td>
						<td>
							<a href="/admin/players/{player.id}" class="anchor">Edit</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
