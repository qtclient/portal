<script lang="ts">
	import Markdoc from '#lib/components/markdoc/Markdoc.svelte';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();
</script>

{#key data.staticPage?.slug}
	<Markdoc content={data.staticPage?.content} />
{/key}
