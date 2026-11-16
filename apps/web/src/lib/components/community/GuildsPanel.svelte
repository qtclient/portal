<script lang="ts">
	import { faShieldHalved } from '@fortawesome/free-solid-svg-icons';
	import { slide } from 'svelte/transition';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import { goto } from '$app/navigation';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import type { Player } from '#lib/players.js';
	import Button from '#lib/components/ui/Button.svelte';
	import OnlineIndicator from '#lib/components/ui/OnlineIndicator.svelte';
	import { debounce } from '#lib/utils.js';

	interface Props {
		onparamschange?: (detail: URLSearchParams) => void;
		data: {
			results: {
				name: string;
				image_url: string | null;
				description: string | null;
				members: number;
				onlineMembers: number;
				leader: Player;
			}[];
			isLoggedIn?: boolean;
		};
		context?: CommunityPanelContext;
		search?: string;
	}

	let {
		data,
		context = 'page',
		search = $bindable(''),
		onparamschange,
	}: Props = $props();

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);

	const onSearchInput = debounce(() => {
		const params = new URLSearchParams();
		if (search.trim()) {
			params.set('search', search.trim());
		}
		if (context === 'overlay') {
			onparamschange?.(params);
			return;
		}
		const qs = params.toString();
		void goto(qs ? `/guilds?${qs}` : '/guilds', {
			replace: true,
			reset: false,
		});
	}, 200);

	function onSearchInputEvent() {
		onSearchInput();
	}
</script>

<div class="flex flex-col items-center gap-2">
	<label class="label flex flex-row gap-2 items-center">
		<span>{$_('guilds.guild-name')}:</span>
		<input
			class="input flex-1"
			type="search"
			name="search"
			bind:value={search}
			oninput={onSearchInputEvent}
			placeholder="{$_('search')}..." />
	</label>

	{#if data.results.length > 0}
		<div class="table-wrap" transition:slide>
			<table class="table table-hover table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th class="w-20"></th>
						<th>{$_('name')}</th>
						<th>{$_('guilds.leader')}</th>
						<th class="w-32">
							<span class="flex flex-row gap-0 items-center">
								{$_('guilds.members')} (<OnlineIndicator online />)
							</span>
						</th>
					</tr>
				</thead>
				<tbody class="transition-all duration-300 ease-in-out">
					{#each data.results as guild}
						<tr class="table-row [&>td]:!align-middle">
							<td>
								<span class="flex flex-row items-center justify-center">
									<Fa icon={faShieldHalved} size="1.5x" />
								</span>
							</td>
							<td>
								<span class="font-extrabold">
									<a
										href="/guilds/{guild.name}"
										class="anchor"
										target={linkTarget}
										rel={linkRel}>{guild.name}</a>
								</span>
								<pre
									class="font-sans font-light whitespace-pre-wrap">{guild.description ??
										''}</pre>
							</td>
							<td class=" w-fit">
								<div class="flex flex-col w-fit">
									<span class="font-semibold flex flex-row gap-1 items-center">
										<OnlineIndicator online={guild.leader.online} />
										<a
											href="/characters/{guild.leader.name}"
											class="anchor"
											target={linkTarget}
											rel={linkRel}>
											{guild.leader.name}
										</a>
									</span>
								</div>
							</td>
							<td>
								<span class="flex flex-row items-center gap-0">
									{guild.members} (<OnlineIndicator
										online />&nbsp;{guild.onlineMembers})
								</span>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="flex flex-col items-center gap-2">
		<p>{$_('guilds.cant-find')}</p>
		{#if data.isLoggedIn}
			{#if context === 'overlay'}
				<a
					href="/guilds/new"
					class="btn preset-filled-primary-500"
					target="_blank"
					rel="noopener noreferrer">
					{$_('guilds.create-new')}
				</a>
			{:else}
				<Button href="/guilds/new">
					{$_('guilds.create-new')}
				</Button>
			{/if}
		{:else}
			<a
				href="/account/login?returnTo=/guilds/new"
				class="anchor"
				target={linkTarget}
				rel={linkRel}>
				{$_('guilds.login')}
			</a>
		{/if}
	</div>
</div>
