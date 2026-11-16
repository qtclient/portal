<script lang="ts">
	import StaticPageForm from '#lib/components/admin/StaticPageForm.svelte';

	import type { ActionData } from './$types';

	interface Props {
		form: ActionData;
	}

	let { form }: Props = $props();
</script>

<StaticPageForm errors={form?.errors} />
