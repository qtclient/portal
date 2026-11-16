<script lang="ts">
	import type { IconDefinition } from '@fortawesome/free-brands-svg-icons';
	import Fa from 'svelte-fa';

	import Tip from '#lib/components/ui/Tip.svelte';
	import { isLoading } from '#lib/stores/loading.svelte.js';

	type Color = NonNullable<Props['color']>;
	type Variant = Exclude<NonNullable<Props['variant']>, 'none'>;

	const VARIANTS: Record<Variant, Record<Color, string>> = {
		filled: {
			primary: 'preset-filled-primary-500',
			secondary: 'preset-filled-secondary-500',
			tertiary: 'preset-filled-tertiary-500',
			error: 'preset-filled-error-500',
			warning: 'preset-filled-warning-500',
			success: 'preset-filled-success-500',
			base: 'preset-filled',
		},
		ghost: {
			primary: 'preset-tonal-primary border border-primary-500',
			secondary: 'preset-tonal-secondary border border-secondary-500',
			tertiary: 'preset-tonal-tertiary border border-tertiary-500',
			error: 'preset-tonal-error border border-error-500',
			warning: 'preset-tonal-warning border border-warning-500',
			success: 'preset-tonal-success border border-success-500',
			base: 'preset-tonal border border-surface-500',
		},
		soft: {
			primary: 'preset-tonal-primary',
			secondary: 'preset-tonal-secondary',
			tertiary: 'preset-tonal-tertiary',
			error: 'preset-tonal-error',
			warning: 'preset-tonal-warning',
			success: 'preset-tonal-success',
			base: 'preset-tonal',
		},
		glass: {
			primary: 'preset-tonal-primary backdrop-blur-sm',
			secondary: 'preset-tonal-secondary backdrop-blur-sm',
			tertiary: 'preset-tonal-tertiary backdrop-blur-sm',
			error: 'preset-tonal-error backdrop-blur-sm',
			warning: 'preset-tonal-warning backdrop-blur-sm',
			success: 'preset-tonal-success backdrop-blur-sm',
			base: 'preset-tonal backdrop-blur-sm',
		},
		ringed: {
			primary: 'preset-outlined-primary-500',
			secondary: 'preset-outlined-secondary-500',
			tertiary: 'preset-outlined-tertiary-500',
			error: 'preset-outlined-error-500',
			warning: 'preset-outlined-warning-500',
			success: 'preset-outlined-success-500',
			base: 'preset-outlined',
		},
	};

	interface Props {
		onclick?: (event: MouseEvent) => void;
		type?: 'button' | 'submit' | 'reset' | null;
		href?: string | null;
		size?: 'icon' | 'xs' | 'sm' | 'md' | 'lg';
		variant?: 'filled' | 'ghost' | 'soft' | 'glass' | 'ringed' | 'none';
		color?:
			| 'primary'
			| 'secondary'
			| 'tertiary'
			| 'error'
			| 'warning'
			| 'success'
			| 'base';
		iconBefore?: IconDefinition | null;
		iconAfter?: IconDefinition | null;
		disabled?: boolean;
		tooltip?: string | null;
		noscroll?: boolean;
		form?: string | undefined;
		formaction?: string | undefined;
		class?: string;
		children?: import('svelte').Snippet;
	}

	let {
		type = null,
		href = null,
		size = 'md',
		variant = 'filled',
		color = 'primary',
		iconBefore = null,
		iconAfter = null,
		disabled = false,
		tooltip: tooltipText = null,
		noscroll = false,
		form = undefined,
		formaction = undefined,
		class: klass = '',
		children,
		onclick,
	}: Props = $props();

	let tag: 'a' | 'button' = $derived(href ? 'a' : 'button');

	let role = $derived(href ? 'link' : 'button');

	let sizeClass = $derived(
		{
			icon: 'btn-icon',
			xs: 'text-xs btn-sm',
			sm: 'btn-sm',
			md: '',
			lg: 'btn-lg',
		}[size],
	);
	let variantClass = $derived(
		variant === 'none' ? '' : (VARIANTS[variant][color] ?? ''),
	);
</script>

<Tip content={tooltipText}>
	{#snippet trigger(attrs)}
		<svelte:element
			this={tag}
			{...attrs}
			{role}
			aria-disabled={disabled || isLoading()}
			tabindex="0"
			{href}
			{type}
			disabled={disabled || isLoading()}
			data-sveltekit-reset={noscroll ? false : undefined}
			{form}
			{formaction}
			{onclick}
			class="btn gap-1 {sizeClass} {variantClass} {klass}">
			{#if iconBefore}
				<Fa icon={iconBefore} />
			{/if}
			{@render children?.()}
			{#if iconAfter}
				<Fa icon={iconAfter} />
			{/if}
		</svelte:element>
	{/snippet}
</Tip>
