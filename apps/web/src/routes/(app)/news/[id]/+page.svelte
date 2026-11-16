<script lang="ts">
	import { faCalendar } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import Markdoc from '#lib/components/markdoc/Markdoc.svelte';
	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#if data.article}
	<header
		class="card !preset-filled-secondary-500 p-2 px-4 text-md -mx-2 flex flex-row gap-2 items-center justify-between w-full">
		<span class="flex flex-row gap-2 items-center">
			<Fa icon={faCalendar} size="xs" />
			<span class="text-sm text-secondary-50">
				{formatDate(data.article.created_at)}
			</span>
			<strong>{data.article.title}</strong>
		</span>
		<em class="text-sm">
			{$_('published-by')}
			<a
				href="/characters/{data.article.author.name}"
				class="text-secondary-200">
				{data.article.author.name}
			</a>
		</em>
	</header>

	<Markdoc content={data.article.content} />
{/if}
