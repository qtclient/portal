<script lang="ts">
	interface Props {
		label?: string | undefined;
		name: string;
		value?: string;
		rows?: number;
		errors?: string[] | undefined;
		labelClass?: string;
		variant?: 'horizontal' | 'vertical';
		required?: boolean;
		placeholder?: string;
	}

	let {
		label = undefined,
		name,
		value = $bindable(''),
		rows = 4,
		errors = undefined,
		labelClass = '',
		variant = 'vertical',
		required = false,
		placeholder = '',
	}: Props = $props();

	let error = $derived((errors ?? [])[0]);
</script>

<label
	class="relative label flex {variant === 'horizontal'
		? 'flex-row gap-2 items-center'
		: 'flex-col gap-0'} grow {labelClass}">
	{#if label}<span>{label}</span>{/if}
	<textarea
		{name}
		{rows}
		{placeholder}
		{required}
		class:input-error={Boolean(errors)}
		class="textarea"
		bind:value></textarea>

	{#if error}
		<p class="absolute top-full text-xs text-error-500 dark:text-error-400">
			{error}
		</p>
	{/if}
</label>
