<script lang="ts">
	import { Switch } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		checked?: boolean;
		label?: string;
		oncheckedchange?: (checked: boolean) => void;
	}

	let { checked = $bindable(false), label, oncheckedchange }: Props = $props();
</script>

<Switch
	{checked}
	onCheckedChange={(e) => {
		checked = e.checked;
		oncheckedchange?.(e.checked);
	}}>
	<Switch.Control>
		<Switch.Thumb />
	</Switch.Control>
	{#if label}
		<Switch.Label>{label}</Switch.Label>
	{/if}
	<Switch.HiddenInput />
</Switch>
