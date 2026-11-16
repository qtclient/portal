<script lang="ts">
	import { faCalendar } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import { goto } from '$app/navigation';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import Paginator from '#lib/components/ui/Paginator.svelte';
	import { formatDate } from '#lib/utils.js';

	interface Props {
		onparamschange?: (detail: URLSearchParams) => void;
		data: {
			articles: {
				id: string | number;
				title: string;
				created_at: Date | bigint | number;
				author: { name: string };
			}[];
			page: number;
			count: number;
			perPage: number;
		};
		context?: CommunityPanelContext;
	}

	let { data, context = 'page', onparamschange }: Props = $props();

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);

	function onPageChange({ page, limit }: { page: number; limit: number }) {
		const params = new URLSearchParams({
			page: String(page),
			limit: String(limit),
		});
		if (context === 'overlay') {
			onparamschange?.(params);
			return;
		}
		void goto(`/news/archive?${params.toString()}`);
	}
</script>

<div class="flex flex-col gap-4 w-full">
	<div class="table-wrap">
		<table class="table table-hover table-auto">
			<thead>
				<tr class="[&>th]:!p-2">
					<th class="w-40">{$_('news-archive.date')}</th>
					<th>{$_('news-archive.title')}</th>
					<th>{$_('news-archive.author')}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.articles as article}
					<tr class="[&>td]:!p-2">
						<td>
							<span class="flex items-center gap-1 text-sm">
								<Fa icon={faCalendar} size="xs" />
								{formatDate(article.created_at)}
							</span>
						</td>
						<td>
							<a
								href="/news/{article.id}"
								class="anchor font-semibold"
								target={linkTarget}
								rel={linkRel}>
								{article.title}
							</a>
						</td>
						<td>
							<a
								href="/characters/{article.author.name}"
								class="anchor"
								target={linkTarget}
								rel={linkRel}>
								{article.author.name}
							</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<Paginator
		page={data.page}
		limit={data.perPage}
		count={data.count}
		amounts={[10, 25, 50]}
		onchange={onPageChange} />
</div>
