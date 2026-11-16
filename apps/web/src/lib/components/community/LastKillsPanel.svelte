<script lang="ts">
	import { _ } from 'svelte-i18n';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import type { LastKillEntry } from '#lib/server/deaths.js';
	import { formatDate } from '#lib/utils.js';

	interface Props {
		data: { deaths: LastKillEntry[] };
		context?: CommunityPanelContext;
	}

	let { data, context = 'page' }: Props = $props();

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);
</script>

<div class="table-wrap w-full max-w-4xl">
	<table class="table table-hover table-auto">
		<thead>
			<tr class="[&>th]:!p-2">
				<th class="w-48">{$_('last-kills.when')}</th>
				<th>{$_('last-kills.event')}</th>
			</tr>
		</thead>
		<tbody>
			{#each data.deaths as death}
				<tr class="[&>td]:!p-2">
					<td>{formatDate(death.time)}</td>
					<td>
						{#if death.mostDamageBy !== death.killedBy}
							{@html $_('death-log-double', {
								values: {
									killer: death.isPlayerKill
										? `<a href="${death.killedByLink}" class="anchor" target="${linkTarget ?? ''}" rel="${linkRel ?? ''}">${death.killedBy}</a>`
										: death.killedBy,
									killerJust: death.unjustified ? $_('unjustified') : '',
									mostdamage: death.mostDamageIsPlayer
										? `<a href="${death.mostDamageLink}" class="anchor" target="${linkTarget ?? ''}" rel="${linkRel ?? ''}">${death.mostDamageBy}</a>`
										: death.mostDamageBy,
									mostdamageJust: death.mostDamageUnjustified
										? $_('unjustified')
										: '',
									level: death.level,
								},
							})}
						{:else}
							{@html $_('death-log-single', {
								values: {
									killer: death.isPlayerKill
										? `<a href="${death.killedByLink}" class="anchor" target="${linkTarget ?? ''}" rel="${linkRel ?? ''}">${death.killedBy}</a>`
										: death.killedBy,
									just: death.unjustified ? $_('unjustified') : '',
									level: death.level,
								},
							})}
						{/if}
						—
						<a
							href={death.victimLink}
							class="anchor"
							target={linkTarget}
							rel={linkRel}>{death.victimName}</a>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if data.deaths.length === 0}
	<p class="text-sm opacity-75">{$_('last-kills.none')}</p>
{/if}
