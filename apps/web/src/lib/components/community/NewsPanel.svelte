<script lang="ts">
	import {
		faCalendar,
		faChevronDown,
		faChevronRight,
	} from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import Markdoc from '#lib/components/markdoc/Markdoc.svelte';
	import { formatDate } from '#lib/utils.js';

	interface Props {
		data: {
			tickers?: {
				id: string | number;
				title: string;
				content: string;
				created_at: Date | bigint | number;
				author: { name: string };
			}[];
			articles: {
				id: string | number;
				title: string;
				content: string;
				created_at: Date | bigint | number;
				author: { name: string };
			}[];
		};
		context?: CommunityPanelContext;
	}

	let { data, context = 'page' }: Props = $props();

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);
	let tickers = $derived(data.tickers ?? []);

	let expanded: Record<string, boolean> = $state({});

	function toggleTicker(id: string | number) {
		const key = String(id);
		expanded = { ...expanded, [key]: !expanded[key] };
	}
</script>

<div class="w-full flex flex-col gap-4">
	{#if tickers.length > 0}
		<section class="flex flex-col gap-1">
			<h3 class="h4 px-1">{$_('news-tickers.title')}</h3>
			{#each tickers as ticker}
				<button
					type="button"
					class="card card-tertiary p-2 px-3 text-left hover:bg-tertiary-400/40 transition-colors"
					onclick={() => toggleTicker(ticker.id)}>
					<div class="flex flex-row gap-2 items-center justify-between">
						<span class="flex flex-row gap-2 items-center min-w-0">
							<Fa
								icon={expanded[String(ticker.id)]
									? faChevronDown
									: faChevronRight}
								size="xs" />
							<span class="text-xs opacity-70 shrink-0"
								>{formatDate(ticker.created_at, { short: true })}</span>
							<span class="font-semibold truncate">{ticker.title}</span>
						</span>
						<a
							href="/news/{ticker.id}"
							class="text-xs anchor shrink-0"
							target={linkTarget}
							rel={linkRel}
							onclick={(event) => event.stopPropagation()}>
							{$_('news-tickers.read')}
						</a>
					</div>
					{#if expanded[String(ticker.id)]}
						<div class="mt-2 text-sm opacity-90">
							<Markdoc content={ticker.content} />
						</div>
					{/if}
				</button>
			{/each}
		</section>
		{#if data.articles.length > 0}
			<hr class="divider" />
		{/if}
	{/if}

	{#each data.articles as article, i}
		<header
			class="card !preset-filled-secondary-500 p-1 px-4 text-md -mx-2 flex flex-row gap-2 items-center justify-between flex-wrap">
			<span class="flex flex-row gap-2 items-center">
				<Fa icon={faCalendar} size="xs" />
				<span class="text-sm text-secondary-50"
					>{formatDate(article.created_at)}</span>
				<a
					href="/news/{article.id}"
					class="font-semibold hover:underline"
					target={linkTarget}
					rel={linkRel}>
					{article.title}
				</a>
			</span>
			<em class="text-sm">
				{$_('published-by')}
				<a
					href="/characters/{article.author.name}"
					class="text-secondary-200"
					target={linkTarget}
					rel={linkRel}>
					{article.author.name}
				</a>
			</em>
		</header>

		<Markdoc content={article.content} />

		{#if i < data.articles.length - 1}
			<hr class="divider" />
		{/if}
	{/each}
</div>
