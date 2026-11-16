<script lang="ts">
	interface Props {
		/** 0..1, or null for an indeterminate bar. */
		value: number | null;
		label?: string;
	}

	let { value, label = '' }: Props = $props();
	let percent = $derived(
		value === null ? null : Math.round(Math.min(1, Math.max(0, value)) * 100),
	);
</script>

<div class="qtc-progress">
	<div
		class="qtc-progress__track"
		role="progressbar"
		aria-label={label}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={percent ?? undefined}>
		<div
			class="qtc-progress__fill"
			class:qtc-progress__fill--busy={percent === null}
			style:width={percent === null ? '30%' : `${percent}%`}>
		</div>
	</div>
	{#if label}
		<span class="qtc-progress__label">{label}</span>
	{/if}
</div>

<style>
	.qtc-progress {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.qtc-progress__track {
		position: relative;
		height: 0.5rem;
		overflow: hidden;
		border-radius: 999px;
		background: var(--qtc-progress-track, rgba(158, 197, 232, 0.15));
	}
	.qtc-progress__fill {
		height: 100%;
		border-radius: inherit;
		background: var(
			--qtc-progress-fill,
			linear-gradient(90deg, #5a8fbf 0%, #9ec5e8 100%)
		);
		transition: width 0.2s ease;
	}
	.qtc-progress__fill--busy {
		position: absolute;
		animation: qtc-progress-busy 1.2s ease-in-out infinite;
	}
	.qtc-progress__label {
		font-size: 0.75rem;
		color: var(--qtc-progress-label, #b7c2d0);
	}
	@keyframes qtc-progress-busy {
		from {
			left: -30%;
		}
		to {
			left: 100%;
		}
	}
</style>
