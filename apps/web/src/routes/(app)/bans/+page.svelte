<script lang="ts">
	import BansPanel from '#lib/components/community/BansPanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<BansPanel {data} context="page" />
