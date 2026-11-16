<script lang="ts">
	import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons';
	import { onMount } from 'svelte';
	import Fa from 'svelte-fa';

	const STORAGE_KEY = 'modeCurrent';

	let dark = $state(true);

	function apply(isDark: boolean) {
		dark = isDark;
		document.documentElement.classList.toggle('dark', isDark);
	}

	onMount(() => {
		// Same key/value semantics as Skeleton 2's LightSwitch ('true' = light).
		apply(localStorage.getItem(STORAGE_KEY) !== 'true');
	});

	function toggle() {
		apply(!dark);
		localStorage.setItem(STORAGE_KEY, String(!dark));
	}
</script>

<button
	type="button"
	class="btn-icon btn-icon-sm preset-tonal"
	aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
	onclick={toggle}>
	<Fa icon={dark ? faMoon : faSun} />
</button>
