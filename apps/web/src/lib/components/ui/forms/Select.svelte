<script lang="ts">
	interface Props {
		onchange?: (event: Event & { currentTarget: HTMLSelectElement }) => void;
		label?: string | undefined;
		name: string;
		value?: string;
		errors?: string[] | undefined;
		labelClass?: string;
		variant?: 'horizontal' | 'vertical';
		children?: import('svelte').Snippet;
	}

	let {
		label = undefined,
		name,
		value = $bindable(''),
		errors = undefined,
		labelClass = '',
		variant = 'vertical',
		children,
		onchange,
	}: Props = $props();

	let error = $derived((errors ?? [])[0]);
</script>

<label
	class="relative label flex {variant === 'horizontal'
		? 'flex-row gap-2 items-center'
		: 'flex-col gap-0'} grow {labelClass}">
	{#if label}<span>{label}</span>{/if}
	<select
		class="select"
		{name}
		bind:value
		class:input-error={Boolean(errors)}
		{onchange}>
		{@render children?.()}
	</select>
	{#if error}
		<p class="absolute top-full text-xs text-error-500 dark:text-error-400">
			{error}
		</p>
	{/if}
</label>
