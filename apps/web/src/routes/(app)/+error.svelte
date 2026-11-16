<script>
	import { page } from '$app/state';
</script>

<div class="flex flex-row justify-center py-32">
	<h3 class="h3">{page.status}: {page.error?.message}</h3>
</div>
