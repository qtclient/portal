<script lang="ts">
	import { page } from '$app/state';

	import GuildsPanel from '#lib/components/community/GuildsPanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let search = $derived(page.url.searchParams.get('search') || '');
</script>

<GuildsPanel {data} context="page" {search} />
