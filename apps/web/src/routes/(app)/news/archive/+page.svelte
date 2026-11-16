<script lang="ts">
	import NewsArchivePanel from '#lib/components/community/NewsArchivePanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<NewsArchivePanel {data} context="page" />
