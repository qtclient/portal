<script lang="ts">
	import { faPlusCircle, faSave } from '@fortawesome/free-solid-svg-icons';
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { _ } from 'svelte-i18n';

	import { applyAction, enhance } from '$app/forms';
	import { goto, refreshAll } from '$app/navigation';

	import GuildMemberEditing from '#lib/components/guilds/GuildMemberEditing.svelte';
	import GuildRankEditing from '#lib/components/guilds/GuildRankEditing.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import TextArea from '#lib/components/ui/forms/TextArea.svelte';
	import StatelessModal from '#lib/components/ui/StatelessModal.svelte';
	import { hotkeys } from '#lib/hotkeys.js';

	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let guild = $derived(data.guild);
	let guildName = $derived(guild?.name ?? '');
	let errors = $derived(form?.errors ?? {});

	function close() {
		if (guild) void goto(`/guilds/${guild.name}`);
	}

	let tabSet = $state<'info' | 'ranks' | 'members'>('info');

	let formId = $derived(`${tabSet}-form`);

	let infoForm: HTMLFormElement | undefined = $state();
	let ranksForm: HTMLFormElement | undefined = $state();
	let membersForm: HTMLFormElement | undefined = $state();

	function save() {
		const currentForm =
			tabSet === 'info'
				? infoForm
				: tabSet === 'ranks'
					? ranksForm
					: membersForm;
		currentForm?.requestSubmit();
	}
</script>

{#if guild}
	<StatelessModal
		title={$_('guilds.edit-guild', { values: { name: guild.name } })}
		onclose={close}>
		{#if errors}
			{#each Object.keys(errors) as key}
				{#each errors[key] as error}
					<p class="text-xs text-error-500">{error}</p>
				{/each}
			{/each}
		{/if}
		<span
			data-hotkeys-global
			use:hotkeys={[
				{ key: 's', metaKey: true, fn: save },
				{ key: 's', ctrlKey: true, fn: save },
			]}></span>

		<Tabs
			value={tabSet}
			onValueChange={(e) => (tabSet = e.value as typeof tabSet)}>
			<Tabs.List>
				<Tabs.Trigger value="info">{$_('guilds.info')}</Tabs.Trigger>
				<Tabs.Trigger value="ranks">{$_('guilds.ranks')}</Tabs.Trigger>
				<Tabs.Trigger value="members">{$_('guilds.members')}</Tabs.Trigger>
				<Tabs.Indicator />
			</Tabs.List>
			<Tabs.Content value={tabSet}>
				{#if tabSet === 'info'}
					<form
						id="info-form"
						bind:this={infoForm}
						action="/guilds/{guildName}/edit?/saveDescription"
						class="flex flex-col gap-1"
						method="post"
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									await refreshAll();
								}
								return applyAction(result);
							};
						}}>
						<TextArea
							name="description"
							label={$_('guilds.description')}
							value={guild.description ?? ''} />
					</form>
				{:else if tabSet === 'ranks'}
					<form
						id="ranks-form"
						bind:this={ranksForm}
						action="/guilds/{guildName}/edit?/saveRanks"
						class="flex flex-col gap-2"
						method="post"
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									await refreshAll();
								}
								return applyAction(result);
							};
						}}>
						<div class="flex flex-row gap-2">
							<h5 class="h5 w-2/5">{$_('guilds.rank-name')}</h5>
							<h5 class="h5 w-1/3">{$_('guilds.rank-level')}</h5>
							<h5 class="h5 w-16">{$_('order')}</h5>
						</div>
						{#each guild.ranks as rank}
							<GuildRankEditing {rank} {guildName} />
						{/each}
						<Button
							formaction="/guilds/{guildName}/edit?/addRank"
							color="success"
							size="sm"
							variant="soft"
							iconBefore={faPlusCircle}>{$_('add')}</Button>
					</form>
				{:else if tabSet === 'members'}
					<form
						id="members-form"
						bind:this={membersForm}
						action="/guilds/{guildName}/edit?/saveMembers"
						class="flex flex-col gap-2"
						method="post"
						use:enhance={() => {
							return async ({ result }) => {
								if (result.type === 'success') {
									await refreshAll();
								}
								return applyAction(result);
							};
						}}>
						<div class="flex flex-row gap-2">
							<h5 class="h5 w-2/5">{$_('guilds.rank-name')}</h5>
							<h5 class="h5 w-1/3">{$_('guilds.rank')}</h5>
							<h5 class="h5 w-16">{$_('guilds.nick')}</h5>
						</div>
						{#each guild.memberships as member}
							<GuildMemberEditing {member} ranks={guild.ranks} />
						{/each}
					</form>
				{/if}
			</Tabs.Content>
		</Tabs>
		<Button size="md" form={formId} iconBefore={faSave}>{$_('save')}</Button>
	</StatelessModal>
{/if}
