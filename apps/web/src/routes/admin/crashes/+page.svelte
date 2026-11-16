<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-wrap items-end justify-between gap-2">
		<div>
			<h2 class="h2">Crashes</h2>
			<p class="text-sm opacity-70">
				{data.total} reports · {data.pending} pending · {data.failed} failed
			</p>
		</div>
		<form method="get" class="flex gap-2 items-end">
			<label class="flex flex-col gap-1">
				<span class="text-sm">Show</span>
				<select class="select" name="show" value={data.show}>
					<option value="open">Unresolved</option>
					<option value="all">All</option>
				</select>
			</label>
			<label class="flex flex-col gap-1">
				<span class="text-sm">Platform</span>
				<select class="select" name="platform" value={data.platform}>
					<option value="">Any</option>
					<option value="windows">Windows</option>
					<option value="macos">macOS</option>
					<option value="linux">Linux</option>
					<option value="wasm">Browser</option>
				</select>
			</label>
			<button class="btn btn-sm preset-filled" type="submit">Filter</button>
		</form>
	</header>

	{#if data.groups.length === 0}
		<p class="opacity-70">No crashes reported.</p>
	{:else}
		<div class="table-wrap">
			<table class="table table-hover table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th>Crash</th>
						<th>Platform</th>
						<th>Count</th>
						<th>Last revision</th>
						<th>Last seen</th>
					</tr>
				</thead>
				<tbody>
					{#each data.groups as group (group.id)}
						<tr class="[&>td]:!p-2" class:opacity-50={group.resolved}>
							<td>
								<a class="anchor break-all" href="/admin/crashes/{group.id}"
									>{group.title}</a>
							</td>
							<td>{group.platform}</td>
							<td class="tabular-nums">{group.count}</td>
							<td><code>{group.last_revision}</code></td>
							<td class="whitespace-nowrap">
								{formatDistanceToNow(group.last_seen, { addSuffix: true })}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
