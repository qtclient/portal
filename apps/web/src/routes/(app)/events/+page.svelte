<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	type EventRow = PageData['active'][number];

	function eventSection(title: string, rows: EventRow[]) {
		return { title, rows };
	}

	let sections = $derived([
		eventSection($_('events.active'), data.active),
		eventSection($_('events.upcoming'), data.upcoming),
		eventSection($_('events.past'), data.past),
	]);
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-col gap-1">
		<h2 class="h2">{$_('events.title')}</h2>
		<p class="text-sm opacity-70">
			{$_('events.updated', {
				values: { date: formatDate(data.lastUpdated * 1000) },
			})}
		</p>
	</header>

	{#each sections as section}
		<section class="flex flex-col gap-2">
			<h3 class="h4">{section.title}</h3>
			{#if section.rows.length === 0}
				<p class="text-sm opacity-60">{$_('events.empty')}</p>
			{:else}
				<div class="flex flex-col gap-2">
					{#each section.rows as event}
						<article
							class="card card-tertiary p-3 border-l-4"
							style="border-left-color: {event.colorlight}; background: linear-gradient(90deg, {event.colordark}33, transparent);">
							<div
								class="flex flex-row flex-wrap justify-between gap-2 items-baseline">
								<h4 class="font-semibold text-lg">{event.name}</h4>
								<span class="text-xs opacity-80">
									{formatDate(event.startdate * 1000)}
									–
									{formatDate(event.enddate * 1000)}
								</span>
							</div>
							{#if event.description}
								<p class="text-sm mt-1 opacity-90 whitespace-pre-wrap">
									{event.description}
								</p>
							{/if}
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
</div>
