<script lang="ts">
	import { pack } from '#lib/pack.js';
	import { _ } from 'svelte-i18n';

	import * as publicEnv from '$app/env/public';

	import type { InstallMode } from '#lib/client/pwa-install.js';

	const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';

	interface Props {
		ondismiss?: () => void;
		oninstall?: () => void;
		mode: InstallMode;
	}

	let { mode, oninstall, ondismiss }: Props = $props();

	const title = PUBLIC_TITLE || 'qtc-aac';

	let prompting = $state(false);

	async function onInstall() {
		if (mode !== 'chromium' || prompting) return;
		prompting = true;
		oninstall?.();
		prompting = false;
	}

	function onDismiss() {
		ondismiss?.();
	}
</script>

<div
	class="play-overlay play-install"
	role="dialog"
	aria-labelledby="play-install-title"
	aria-describedby="play-install-desc">
	<img
		class="play-install__icon"
		src={pack.site.icons[0]?.src ?? pack.site.favicon}
		alt=""
		width="48"
		height="48" />
	<div class="play-install__body">
		<p id="play-install-title" class="play-install__title">
			{$_('playInstall.title')}
		</p>
		<p id="play-install-desc" class="play-install__desc">
			{#if mode === 'ios'}
				{$_('playInstall.iosHint')}
			{:else if mode === 'manual'}
				{$_('playInstall.manualHint')}
			{:else}
				{$_('playInstall.description', { values: { title } })}
			{/if}
		</p>
	</div>
	<div class="play-install__actions">
		{#if mode === 'chromium'}
			<button
				type="button"
				class="play-install__cta"
				disabled={prompting}
				onclick={onInstall}>
				{$_('playInstall.cta')}
			</button>
		{/if}
		<button type="button" class="play-install__dismiss" onclick={onDismiss}>
			{$_('playInstall.dismiss')}
		</button>
	</div>
</div>

<style>
	.play-install {
		position: absolute;
		left: 0.75rem;
		right: 0.75rem;
		bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 0.85rem;
		border-radius: 0.5rem;
		background: linear-gradient(180deg, #1a222c 0%, #12171e 100%);
		border: 1px solid rgba(158, 197, 232, 0.28);
		box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
		color: #e8edf4;
		font-family: 'Segoe UI', 'Helvetica Neue', Helvetica, sans-serif;
		pointer-events: auto;
		max-width: min(28rem, calc(100% - 1.5rem));
		margin-inline: auto;
		box-sizing: border-box;
	}
	.play-install__icon {
		flex-shrink: 0;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.45rem;
		background: #0b0e12;
	}
	.play-install__body {
		min-width: 0;
		flex: 1;
	}
	.play-install__title {
		margin: 0 0 0.2rem;
		font-size: 0.875rem;
		font-weight: 650;
		color: #e8edf4;
	}
	.play-install__desc {
		margin: 0;
		font-size: 0.75rem;
		line-height: 1.35;
		color: #b7c2d0;
	}
	.play-install__actions {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
		flex-shrink: 0;
	}
	.play-install__cta,
	.play-install__dismiss {
		appearance: none;
		border: 0;
		cursor: pointer;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		border-radius: 0.3rem;
		padding: 0.4rem 0.7rem;
		white-space: nowrap;
	}
	.play-install__cta {
		background: linear-gradient(180deg, #5a8fbf 0%, #3d6f9a 100%);
		color: #f4f8fc;
	}
	.play-install__cta:hover:not(:disabled) {
		filter: brightness(1.08);
	}
	.play-install__cta:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.play-install__dismiss {
		background: transparent;
		color: #9aa8b8;
	}
	.play-install__dismiss:hover {
		color: #c5d0dc;
	}
	@media (max-width: 420px) {
		.play-install {
			flex-wrap: wrap;
		}
		.play-install__actions {
			flex-direction: row;
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
