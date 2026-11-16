<script lang="ts">
	import HighscoresPanel from '#lib/components/community/HighscoresPanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<HighscoresPanel {data} context="page" />
