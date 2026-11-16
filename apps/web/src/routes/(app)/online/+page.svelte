<script lang="ts">
	import OnlinePanel from '#lib/components/community/OnlinePanel.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

<OnlinePanel {data} />
