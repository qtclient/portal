<script lang="ts">
	import { _ } from 'svelte-i18n';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import type { Player } from '#lib/players.js';
	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import OnlineIndicator from '#lib/components/ui/OnlineIndicator.svelte';
	import { formatDate } from '#lib/utils.js';

	interface Props {
		data: {
			groups: {
				name: string;
				members: Player[];
			}[];
		};
		context?: CommunityPanelContext;
	}

	let { data, context = 'page' }: Props = $props();

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);
</script>

<div class="flex flex-col gap-6 w-full max-w-3xl">
	{#each data.groups as group}
		<section class="flex flex-col gap-2">
			<h3 class="h4">{group.name}</h3>
			<div class="table-wrap">
				<table class="table table-hover table-auto">
					<thead>
						<tr class="[&>th]:!p-2">
							<th class="w-24"></th>
							<th>{$_('name')}</th>
							<th>{$_('level')}</th>
							<th>{$_('last-login')}</th>
						</tr>
					</thead>
					<tbody>
						{#each group.members as member}
							<tr class="[&>td]:!p-2">
								<td>
									<AnimatedOutfit
										class="h-16"
										outfit={member}
										alt={member.name} />
								</td>
								<td>
									<span class="flex items-center gap-1 font-semibold">
										<OnlineIndicator online={member.online} />
										<a
											href="/characters/{member.name}"
											class="anchor"
											target={linkTarget}
											rel={linkRel}>
											{member.name}
										</a>
									</span>
								</td>
								<td>{member.level}</td>
								<td>
									{member.lastLogin
										? formatDate(member.lastLogin)
										: $_('team.never')}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/each}
</div>

{#if data.groups.length === 0}
	<p class="text-sm opacity-75">{$_('team.none')}</p>
{/if}
