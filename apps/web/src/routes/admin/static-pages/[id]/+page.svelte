<script lang="ts">
	import StaticPageForm from '#lib/components/admin/StaticPageForm.svelte';

	import type { ActionData, PageData } from './$types';

	interface Props {
		data: PageData;
		form: ActionData;
	}

	let { data, form }: Props = $props();

	let staticPage = $derived(form?.staticPage ?? data.staticPage);
</script>

<StaticPageForm {staticPage} errors={form?.errors} />
