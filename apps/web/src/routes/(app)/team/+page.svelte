<script lang="ts">
	import TeamPanel from '#lib/components/community/TeamPanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<TeamPanel {data} context="page" />
