<script lang="ts">
	interface Props {
		label: string;
		name: string;
		checked?: boolean;
		errors: string[] | undefined;
		labelClass?: string;
	}

	let {
		label,
		name,
		checked = $bindable(false),
		errors,
		labelClass = '',
	}: Props = $props();

	let error = $derived((errors ?? [])[0]);
</script>

<label
	class:input-error={Boolean(errors)}
	class="relative label flex flex-row gap-2 items-center grow {labelClass}">
	<input class="checkbox" type="checkbox" {name} bind:checked />
	<p>{label}</p>
	{#if error}
		<p class="absolute top-full text-xs text-error-500 dark:text-error-400">
			{error}
		</p>
	{/if}
</label>
