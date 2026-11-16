<script lang="ts">
	import {
		faArrowRightFromBracket,
		faCancel,
		faCheck,
		faHandHoldingHand,
		faRemove,
		faWarning,
	} from '@fortawesome/free-solid-svg-icons';
	import { cubicInOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { _ } from 'svelte-i18n';

	import { page } from '$app/state';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import OnlineIndicator from '#lib/components/ui/OnlineIndicator.svelte';
	import { enhance } from '#lib/enchance.js';
	import { type Player, vocationString } from '#lib/players.js';

	interface Props {
		character: Player;
		rankLevel: number;
		isSelf: boolean;
		isOwner: boolean;
		guildName: string;
		canRemovePlayer?: boolean;
		isInvited?: boolean;
		canRevokeInvite?: boolean;
	}

	let {
		character,
		rankLevel,
		isSelf,
		isOwner,
		guildName,
		canRemovePlayer = false,
		isInvited = false,
		canRevokeInvite = false,
	}: Props = $props();

	let leaving = $derived(page.url.searchParams.get('leave') === character.name);
	let resigning = $derived(page.data.resigning);
</script>

<tr
	class={[
		'table-row [&>td]:align-middle! cursor-pointer border-b',
		{
			'border-primary-300 dark:border-primary-600': rankLevel === 3,
			'border-secondary-300 dark:border-secondary-600': rankLevel === 2,
			'border-tertiary-300 dark:border-tertiary-600':
				rankLevel < 2 && rankLevel > 0,
		},
	]}
	transition:fly|local={{
		duration: 300,
		y: -20,
		easing: cubicInOut,
	}}>
	<td>
		<AnimatedOutfit outfit={character} alt={character.name} />
	</td>
	<td class=" w-fit">
		<div class="flex flex-col w-fit">
			<span class="font-semibold flex flex-row gap-1 items-center">
				<OnlineIndicator online={character.online} />
				<a href="/characters/{character.name}" class="anchor">
					{character.name}
				</a>
				{#if character.guild?.nick}
					<em class="font-light">({character.guild.nick})</em>
				{/if}

				{#if isInvited}
					{#if canRevokeInvite}
						<form
							action="/guilds/{guildName}/invite?/uninvite"
							method="post"
							use:enhance>
							<input type="hidden" name="name" value={character.name} />
							<Button
								type="submit"
								size="xs"
								color="secondary"
								class="py-0.5 px-2 font-light">{$_('guilds.uninvite')}</Button>
						</form>
					{/if}
					{#if isSelf}
						<form
							action="/guilds/{guildName}/join?/accept"
							method="post"
							use:enhance>
							<input type="hidden" name="name" value={character.name} />
							<Button
								size="icon"
								class="text-xs h-4 w-4"
								color="success"
								iconBefore={faCheck}
								tooltip={$_('guilds.accept')} />
						</form>
						<form
							action="/guilds/{guildName}/join?/reject"
							method="post"
							use:enhance>
							<input type="hidden" name="name" value={character.name} />
							<Button
								size="icon"
								class="text-xs h-4 w-4"
								color="error"
								iconBefore={faRemove}
								tooltip={$_('guilds.reject')} />
						</form>
					{/if}
				{:else if (canRemovePlayer || isSelf) && !isOwner}
					<form action="/guilds/{guildName}/leave" method="post" use:enhance>
						<input type="hidden" name="name" value={character.name} />
						<Button
							{...leaving
								? { type: 'submit' }
								: { href: `?leave=${character.name}` }}
							noscroll
							size="xs"
							color="secondary"
							iconAfter={leaving ? faWarning : faArrowRightFromBracket}
							class="py-0.5 px-2 font-light">
							{#if leaving}
								{$_('guilds.confirm')}
							{:else}
								{isSelf ? $_('guilds.leave') : $_('guilds.remove')}
							{/if}
						</Button>
						{#if leaving}
							<Button
								href="/guilds/{guildName}"
								noscroll
								size="xs"
								color="primary"
								variant="soft"
								iconAfter={faCancel}
								class="py-0.5 px-2 font-light">
								{$_('guilds.cancel-leave')}
							</Button>
						{/if}
					</form>
				{/if}
				{#if resigning && !isOwner && !isInvited}
					<form action="/guilds/{guildName}/resign" method="post" use:enhance>
						<input type="hidden" name="newOwner" value={character.name} />
						<Button
							noscroll
							size="xs"
							color="primary"
							iconAfter={faHandHoldingHand}
							class="py-0.5 px-2 font-light">
							{$_('guilds.assing-new-owner')}
						</Button>
					</form>
				{/if}
			</span>
		</div>
	</td>
	<td>{vocationString(character.vocation)}</td>
	<td>{character.level}</td>
</tr>
