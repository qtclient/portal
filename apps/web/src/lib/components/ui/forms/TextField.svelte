<script lang="ts">
	import type { FullAutoFill } from 'svelte/elements';

	interface Props {
		oninput?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onfocus?: (event: FocusEvent) => void;
		onblur?: (event: FocusEvent) => void;
		onkeydown?: (event: KeyboardEvent) => void;
		label?: string | undefined;
		name: string;
		value?: string;
		placeholder?: string | undefined;
		errors?: string[] | undefined;
		autocomplete?: FullAutoFill;
		type?: string;
		labelClass?: string;
		variant?: 'horizontal' | 'vertical';
		required?: boolean;
	}

	let {
		label = undefined,
		name,
		value = $bindable(''),
		placeholder = undefined,
		errors = undefined,
		autocomplete = 'off',
		type = 'text',
		labelClass = '',
		variant = 'vertical',
		required = false,
		oninput,
		onchange,
		onfocus,
		onblur,
		onkeydown,
	}: Props = $props();

	function typeAction(node: HTMLInputElement) {
		node.type = type;
	}
	let error = $derived((errors ?? [])[0]);
</script>

<label
	class="relative label flex {variant === 'horizontal'
		? 'flex-row gap-2 items-center'
		: 'flex-col gap-0'} grow {labelClass}">
	{#if label}<span>{label}</span>{/if}
	<input
		{required}
		bind:value
		{name}
		{placeholder}
		class="input flex-1"
		class:text-right={type === 'number'}
		class:input-error={Boolean(errors)}
		{autocomplete}
		use:typeAction
		{oninput}
		{onchange}
		{onfocus}
		{onblur}
		{onkeydown} />
	{#if error}
		<p class="absolute top-full text-xs text-error-500 dark:text-error-400">
			{error}
		</p>
	{/if}
</label>
