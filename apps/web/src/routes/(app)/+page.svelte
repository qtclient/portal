<script lang="ts">
	import NewsPanel from '#lib/components/community/NewsPanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<NewsPanel {data} context="page" />
