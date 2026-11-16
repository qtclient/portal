<script lang="ts">
	import { onMount, type Snippet, tick } from 'svelte';

	import { portal } from '#lib/actions/portal.js';

	interface Props {
		open?: boolean;
		label?: string;
		/** Accessible name when the visible trigger is an icon. */
		ariaLabel?: string;
		align?: 'start' | 'center' | 'end';
		/** Compact icon-style trigger (meatball, etc.). */
		icon?: boolean;
		/** No trigger chrome; the trigger snippet supplies its own look (status pill). */
		bare?: boolean;
		trigger?: Snippet;
		children?: Snippet;
		ontoggle?: () => void;
		onclose?: () => void;
	}

	let {
		open = false,
		label = '',
		ariaLabel = '',
		align = 'center',
		icon = false,
		bare = false,
		trigger,
		children,
		ontoggle,
		onclose,
	}: Props = $props();

	let triggerEl: HTMLButtonElement | undefined = $state();
	let popoverEl: HTMLDivElement | undefined = $state();
	let popoverStyle = $state('');

	async function updatePosition() {
		await tick();
		if (!open || !triggerEl) return;

		const rect = triggerEl.getBoundingClientRect();
		const top = rect.bottom + 6;
		const margin = 12;
		const maxW = Math.min(42 * 16, window.innerWidth - margin * 2);

		let left = rect.left;
		if (align === 'center') {
			left = rect.left + rect.width / 2;
		} else if (align === 'end') {
			left = rect.right;
		}

		// Clamp so the popover stays on-screen for center/end transforms.
		if (align === 'center') {
			const half = maxW / 2;
			left = Math.min(
				window.innerWidth - margin - half,
				Math.max(margin + half, left),
			);
		} else if (align === 'end') {
			left = Math.min(
				window.innerWidth - margin,
				Math.max(margin + Math.min(18 * 16, maxW), left),
			);
		} else {
			left = Math.min(
				window.innerWidth - margin - Math.min(18 * 16, maxW),
				Math.max(margin, left),
			);
		}

		popoverStyle = `top:${top}px;left:${left}px;`;
	}

	function onTriggerClick(event: MouseEvent) {
		event.stopPropagation();
		ontoggle?.();
	}

	$effect(() => {
		if (open) {
			void updatePosition();
		}
	});

	onMount(() => {
		const onDocClick = (event: MouseEvent) => {
			if (triggerEl?.getAttribute('aria-expanded') !== 'true') return;
			const target = event.target as Node | null;
			if (!target) return;
			if (triggerEl?.contains(target) || popoverEl?.contains(target)) return;
			onclose?.();
		};
		const onKey = (event: KeyboardEvent) => {
			if (
				event.key === 'Escape' &&
				triggerEl?.getAttribute('aria-expanded') === 'true'
			) {
				onclose?.();
			}
		};
		const onResize = () => {
			if (open) void updatePosition();
		};

		document.addEventListener('click', onDocClick);
		window.addEventListener('keydown', onKey);
		window.addEventListener('resize', onResize);
		return () => {
			document.removeEventListener('click', onDocClick);
			window.removeEventListener('keydown', onKey);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

<button
	type="button"
	class="topbar-popover-trigger"
	class:topbar-popover-trigger--open={open}
	class:topbar-popover-trigger--icon={icon}
	class:topbar-popover-trigger--bare={bare}
	bind:this={triggerEl}
	aria-expanded={open}
	aria-haspopup="dialog"
	aria-label={ariaLabel || label || undefined}
	onclick={onTriggerClick}>
	{#if trigger}{@render trigger()}{:else}{label}{/if}
</button>

{#if open}
	<div
		use:portal={'body'}
		bind:this={popoverEl}
		class="topbar-popover"
		class:topbar-popover--align-start={align === 'start'}
		class:topbar-popover--align-center={align === 'center'}
		class:topbar-popover--align-end={align === 'end'}
		style={popoverStyle}
		role="dialog"
		aria-label={ariaLabel || label}>
		{@render children?.()}
	</div>
{/if}

<style>
	.topbar-popover-trigger {
		border: 0;
		background: rgba(158, 197, 232, 0.08);
		color: #c5dcf0;
		padding: 0.22rem 0.55rem;
		border-radius: 0.28rem;
		font: inherit;
		font-size: 0.75rem;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.topbar-popover-trigger--icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 1.85rem;
		padding: 0;
		font-size: 1rem;
	}
	.topbar-popover-trigger:hover,
	.topbar-popover-trigger--open {
		background: rgba(158, 197, 232, 0.16);
		color: #fff;
	}
	.topbar-popover-trigger--bare,
	.topbar-popover-trigger--bare:hover,
	.topbar-popover-trigger--bare.topbar-popover-trigger--open {
		padding: 0;
		background: transparent;
		color: inherit;
		border-radius: 999px;
		min-width: 0;
		flex-shrink: 1;
	}
	.topbar-popover {
		position: fixed;
		z-index: 100;
		min-width: min(18rem, calc(100vw - 1.5rem));
		width: max-content;
		max-width: min(42rem, calc(100vw - 1.5rem));
		max-height: min(
			32rem,
			calc(
				100dvh - var(--qtc-topbar-h, 48px) - env(safe-area-inset-top, 0px) -
					1.25rem
			)
		);
		overflow: auto;
		padding: 0.75rem 0.85rem;
		border-radius: 0.4rem;
		border: 1px solid rgba(158, 197, 232, 0.22);
		background: linear-gradient(180deg, #141a22 0%, #0d1117 100%);
		box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45);
		color: #e8edf4;
		font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, sans-serif;
		font-size: 0.8125rem;
	}
	.topbar-popover--align-start {
		transform: none;
	}
	.topbar-popover--align-center {
		transform: translateX(-50%);
	}
	.topbar-popover--align-end {
		transform: translateX(-100%);
	}
</style>
