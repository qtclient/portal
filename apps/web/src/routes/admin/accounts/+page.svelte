<script lang="ts">
	import { _ } from 'svelte-i18n';

	import Button from '#lib/components/ui/Button.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<form method="get" class="flex gap-2 items-end mb-4">
	<label class="flex flex-col gap-1">
		<span class="text-sm">{$_('admin.search')}</span>
		<input
			class="input"
			type="search"
			name="q"
			value={data.q}
			placeholder="email or account name" />
	</label>
	<Button type="submit" size="sm">{$_('search')}</Button>
</form>

{#if data.accounts.length > 0}
	<div class="table-wrap">
		<table class="table table-hover table-auto">
			<thead>
				<tr class="[&>th]:!p-2">
					<th>ID</th>
					<th>{$_('account-name')}</th>
					<th>{$_('email')}</th>
					<th>{$_('admin.account-type')}</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.accounts as account}
					<tr class="[&>td]:!p-2">
						<td>{account.id}</td>
						<td>{account.name}</td>
						<td>{account.email}</td>
						<td>{account.type}</td>
						<td>
							<a href="/admin/accounts/{account.id}" class="anchor"
								>{$_('edit')}</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
