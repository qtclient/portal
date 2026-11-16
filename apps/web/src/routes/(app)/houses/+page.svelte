<script lang="ts">
	import HousesPanel from '#lib/components/community/HousesPanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<HousesPanel {data} context="page" />
