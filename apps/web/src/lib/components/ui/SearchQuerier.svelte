<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import { debounce } from '#lib/utils.js';

	interface Props {
		label: string;
	}

	let { label }: Props = $props();

	let value = $state(page.url.searchParams.get('search') || '');

	export const reset = (): void => void (value = '');

	const onSearchInput = debounce(() => {
		const url = new URL(page.url.href);
		if (value === '') {
			url.searchParams.delete('search');
			void goto(url.pathname, {
				replace: true,
				reset: false,
			});

			return;
		}

		url.searchParams.set('search', value);
		void goto(`?${url.searchParams.toString()}`, {
			replace: true,
			reset: false,
		});
	}, 200);

	$effect(() => {
		if (browser) {
			if (page.url.searchParams.get('search') !== value) onSearchInput();
		}
	});
</script>

<TextField
	{label}
	type="search"
	name="search"
	variant="horizontal"
	placeholder={$_('search')}
	bind:value />
