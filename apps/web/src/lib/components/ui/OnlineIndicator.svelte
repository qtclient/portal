<script lang="ts">
	import { faCircle } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import Tip from '#lib/components/ui/Tip.svelte';

	interface Props {
		online?: boolean;
	}

	let { online = false }: Props = $props();
</script>

<Tip content={online ? $_('online') : $_('offline')}>
	{#snippet trigger(attrs)}
		<span {...attrs} class={online ? 'text-success-600' : 'text-error-600'}>
			<Fa icon={faCircle} size="xs" />
		</span>
	{/snippet}
</Tip>
