<script lang="ts">
	import NewsForm from '#lib/components/admin/NewsForm.svelte';

	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();
</script>

<NewsForm
	authorName={data.author?.name}
	errors={form?.errors ??
		(data.author ? null : { global: ['No main character found'] })} />
