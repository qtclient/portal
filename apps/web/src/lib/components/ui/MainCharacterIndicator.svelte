<script lang="ts">
	import { faDiamond } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import Tip from '#lib/components/ui/Tip.svelte';
</script>

<Tip content={$_('main-character')}>
	{#snippet trigger(attrs)}
		<span {...attrs} class="text-xs text-primary-800">
			<Fa icon={faDiamond} />
		</span>
	{/snippet}
</Tip>
