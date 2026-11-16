<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';
	import { enhance } from '#lib/enchance.js';
	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<div class="flex flex-col gap-4 mt-4">
	<h3 class="h3">{$_('devices.title')}</h3>
	<p class="text-sm opacity-80">{$_('devices.description')}</p>

	{#if data.devices.length === 0}
		<p class="text-sm opacity-60">{$_('devices.empty')}</p>
	{:else}
		<div class="table-wrap">
			<table class="table table-hover table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th>{$_('devices.name')}</th>
						<th>{$_('created')}</th>
						<th>{$_('devices.last-used')}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.devices as device (device.id)}
						<tr class="[&>td]:!p-2">
							<td>{device.name}</td>
							<td>{formatDate(device.created_at)}</td>
							<td>{formatDate(device.last_used_at)}</td>
							<td class="text-right">
								<form method="post" action="?/revoke" use:enhance>
									<input type="hidden" name="id" value={device.id} />
									<Button type="submit" size="sm" color="error">
										{$_('devices.revoke')}
									</Button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<form method="post" action="?/revokeAll" use:enhance>
			<Button type="submit" size="sm" color="error">
				{$_('devices.revoke-all')}
			</Button>
		</form>
	{/if}
</div>
