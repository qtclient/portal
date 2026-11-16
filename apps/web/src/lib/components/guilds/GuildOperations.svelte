<script lang="ts">
	import {
		faEdit,
		faHandHoldingHand,
		faPersonCirclePlus,
		faRefresh,
		faTrash,
	} from '@fortawesome/free-solid-svg-icons';
	import { _ } from 'svelte-i18n';

	import { page } from '$app/state';

	import Button from '#lib/components/ui/Button.svelte';

	interface Props {
		name: string;
		isOwner: boolean;
		isLeader: boolean;
		isVice: boolean;
	}

	let { name, isOwner, isLeader, isVice }: Props = $props();
	let resigning = $derived(page.data.resigning);
</script>

<div class="flex flex-row items-end gap-1">
	{#if isVice}
		<Button
			href="/guilds/{name}/invite"
			size="sm"
			iconBefore={faPersonCirclePlus}>
			{$_('guilds.invite')}
		</Button>
	{/if}
	{#if isLeader}
		<Button
			href="/guilds/{name}/edit"
			size="sm"
			color="secondary"
			iconBefore={faEdit}>
			{$_('guilds.edit')}
		</Button>
	{/if}
	{#if isOwner}
		{#if resigning}
			<Button
				href="/guilds/{name}"
				size="sm"
				color="warning"
				iconBefore={faRefresh}>
				{$_('guilds.cancel-resign')}
			</Button>
		{:else}
			<Button
				href="/guilds/{name}/resign"
				size="sm"
				color="warning"
				iconBefore={faHandHoldingHand}>
				{$_('guilds.resign')}
			</Button>
		{/if}
		<Button
			href="/guilds/{name}/disband"
			size="xs"
			color="error"
			iconBefore={faTrash}>
			{$_('guilds.disband')}
		</Button>
	{/if}
</div>
