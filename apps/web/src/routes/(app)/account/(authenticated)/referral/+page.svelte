<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<div class="flex flex-col gap-4 mt-4">
	<h3 class="h3">{$_('referral.title')}</h3>

	<p class="text-sm opacity-80">
		{$_('referral.description', {
			values: { level: data.minLevel, reward: data.reward },
		})}
	</p>

	<label class="label max-w-xl">
		<span>{$_('referral.link')}</span>
		<input
			class="input"
			readonly
			value={data.link}
			onfocus={(e) => e.currentTarget.select()} />
	</label>

	<section class="flex flex-col gap-2">
		<h4 class="h4">{$_('referral.invitees')}</h4>
		{#if data.invitees.length === 0}
			<p class="text-sm opacity-60">{$_('referral.invitees-empty')}</p>
		{:else}
			<div class="table-wrap">
				<table class="table table-hover table-auto">
					<thead>
						<tr class="[&>th]:!p-2">
							<th>{$_('email')}</th>
							<th>{$_('level')}</th>
							<th>{$_('referral.rewarded')}</th>
							<th>{$_('created')}</th>
						</tr>
					</thead>
					<tbody>
						{#each data.invitees as invitee}
							<tr class="[&>td]:!p-2">
								<td>{invitee.emailMasked}</td>
								<td>
									{invitee.topLevel}
									{#if invitee.topName}
										<span class="text-xs opacity-60"
											>({invitee.topName})</span>
									{/if}
								</td>
								<td>
									{invitee.rewarded
										? $_('referral.yes')
										: $_('referral.pending')}
								</td>
								<td class="text-sm"
									>{formatDate(invitee.createdAt * 1000)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>
</div>
