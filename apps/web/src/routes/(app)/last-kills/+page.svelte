<script lang="ts">
	import LastKillsPanel from '#lib/components/community/LastKillsPanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<LastKillsPanel {data} context="page" />
