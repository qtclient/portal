<script lang="ts">
	import { onMount } from 'svelte';

	import * as publicEnv from '$app/env/public';

	import { diag, installPlayDiag } from '#lib/client/play-diag.js';
	import {
		applyProductPlayCss,
		bootstrapLauncherPackage,
		bootTibia,
		hidePlayTransition,
		hidePlayTransitionWhenPainted,
		installGameKeyGuard,
		PLAY_TRANSITION_KEY,
		resumePlayTransition,
		takePlayHandoff,
		tipUrl,
		updatePlayTransition,
	} from '#lib/client/tibia-browser.js';
	import { pack } from '#lib/pack.js';
	import { browserTitle } from '#lib/utils.js';

	import type { PageData } from './$types';

	const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let runtimeError = $state('');

	/**
	 * /play boot: the desktop two-binary model. Every visit starts the launcher
	 * (launcher.wasm, Widgets only) — it checks/updates the tip like the CIP
	 * launcher. Its Play button hands off (sessionStorage + reload) to the game
	 * (tibia.wasm, SKIP_LAUNCHER). Never Widgets + QML in one Module.
	 */
	async function bootPlay(cdn: string) {
		const clientProgram = takePlayHandoff();
		const skipLauncher = clientProgram !== null;
		const launcherBoot = !skipLauncher;
		try {
			sessionStorage.setItem(PLAY_TRANSITION_KEY, '1');
		} catch {
			/* ignore */
		}
		diag('bootPlay', { skipLauncher, launcherBoot, cdn });
		resumePlayTransition();
		updatePlayTransition(
			skipLauncher ? 'Launching client…' : 'Loading game…',
			8,
		);
		const clientBase = tipUrl(cdn, 'launcher/tibiaclient-web-current');
		const launcherBase = tipUrl(cdn, 'launcher/launcher-web-current');
		const wasmBase = launcherBoot ? launcherBase : clientBase;
		const assetBase = new URL(cdn, location.origin).href.replace(/\/+$/, '');
		const stage = document.getElementById('play-stage');
		if (!stage) throw new Error('Missing #play-stage');

		const [stampRes, releaseRes] = await Promise.all([
			fetch(`${clientBase}/package.json.version`, { cache: 'no-store' }),
			fetch(`${assetBase}/latest/release.json`, { cache: 'no-store' }),
		]);
		if (!stampRes.ok)
			throw new Error(`client package.json.version HTTP ${stampRes.status}`);
		if (!releaseRes.ok)
			throw new Error(`latest/release.json HTTP ${releaseRes.status}`);
		const engineStamp = (await stampRes.text()).trim();
		const release = (await releaseRes.json()) as {
			revision?: string;
			targets?: { web?: { wasm?: string } };
		};
		const revision = release.revision?.trim() ?? '';
		const wasmRel = release.targets?.web?.wasm?.trim() ?? '';
		if (!revision || !wasmRel)
			throw new Error('latest/release.json has no revision / web wasm tip');
		const packWasmBase = tipUrl(cdn, wasmRel);
		diag('engine stamps', { engineStamp, revision, packWasmBase });

		// CipSoft art as soon as tip URLs are known, not a black stage while
		// the engine loads.
		applyProductPlayCss({ assetBase, packWasmBase, engineStamp });

		// The portal installs the launcher (the desktop app install); the game
		// starts from the package the launcher installed (see bootTibia).
		if (launcherBoot) {
			const { fromCache, version } = await bootstrapLauncherPackage(cdn, (p) =>
				updatePlayTransition(p.label, p.progress),
			);
			diag('bootstrapLauncherPackage done', { fromCache, version });
		}
		updatePlayTransition(skipLauncher ? 'Starting game…' : 'Preparing…', 82);

		diag('bootTibia start', {
			engine: launcherBoot ? 'launcher' : 'tibia',
			skipLauncher,
			wasmBase,
			packWasmBase,
		});
		bootTibia({
			engine: launcherBoot ? 'launcher' : 'tibia',
			wasmBase,
			revision,
			engineStamp,
			assetBase,
			skipLauncher,
			clientProgram: clientProgram ?? undefined,
			onStatus(text, progress) {
				updatePlayTransition(text, progress);
			},
			onReady() {
				// onLoaded is too early for both paths (before callMain / tip work).
				diag('bootTibia onReady', { skipLauncher, launcherBoot });
			},
			onLauncherReady() {
				diag('bootTibia onLauncherReady', { launcherBoot });
				// Wait for the first Qt canvas paint — hiding at callMain flashes
				// empty/lightgray chrome before Widgets appear.
				if (launcherBoot) hidePlayTransitionWhenPainted();
			},
			onFatal(message) {
				diag('bootTibia onFatal', { message, skipLauncher, launcherBoot });
				hidePlayTransition();
				runtimeError = message;
			},
			onGameReady() {
				diag('bootTibia onGameReady', { skipLauncher });
				hidePlayTransitionWhenPainted();
			},
		});
	}

	onMount(() => {
		const removeDiag = installPlayDiag();
		const removeKeyGuard = installGameKeyGuard();
		document.documentElement.classList.add('play-mode');
		document.documentElement.style.overflow = 'hidden';
		document.body.style.overflow = 'hidden';
		document.body.style.margin = '0';
		document.body.style.height = '100%';
		document.body.style.background = '#0b0e12';

		void bootPlay(data.cdn).catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			diag('bootPlay threw', { message });
			hidePlayTransition();
			runtimeError = message;
		});

		return () => {
			removeKeyGuard();
			removeDiag();
			document.documentElement.classList.remove('play-mode');
			document.documentElement.style.overflow = '';
			document.body.style.overflow = '';
			document.body.style.margin = '';
			document.body.style.height = '';
			document.body.style.background = '';
		};
	});
</script>

<svelte:head>
	<title>{browserTitle(data.title)}</title>
	<meta
		name="viewport"
		content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover" />
	<link rel="manifest" href="/play/manifest.webmanifest" />
	<meta name="theme-color" content="#0b0e12" />
	<meta name="mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta
		name="apple-mobile-web-app-status-bar-style"
		content="black-translucent" />
	<meta name="apple-mobile-web-app-title" content={PUBLIC_TITLE || 'qtc-aac'} />
	{#if pack.site.appleTouchIcon}
		<link rel="apple-touch-icon" href={pack.site.appleTouchIcon} />
	{/if}
</svelte:head>

<div class="play-root">
	<div id="play-stage" class="play-stage">
		<div id="play-transition" class="play-transition" aria-live="polite">
			<p id="play-transition-status">Loading {pack.client.name}…</p>
			<div id="play-transition-bar" class="play-transition-bar">
				<div id="play-transition-fill" class="play-transition-fill"></div>
			</div>
		</div>
		{#if runtimeError}
			<div class="play-error" role="alert">
				<p>{runtimeError}</p>
				<button type="button" onclick={() => location.reload()}>Reload</button>
			</div>
		{/if}
		<div id="otc-text-sinks" aria-hidden="true"></div>
		<canvas
			class="backbuffer"
			id="canvas"
			oncontextmenu={(event) => event.preventDefault()}
			tabindex="0"></canvas>
	</div>
</div>

<style>
	:global(html),
	:global(body) {
		height: 100%;
		height: 100dvh;
	}
	.play-root {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		height: 100dvh;
		background: #0b0e12;
		overscroll-behavior: contain;
		overflow: hidden;
		box-sizing: border-box;
	}
	.play-stage {
		position: absolute;
		/* Notch, rounded corners and the home indicator (viewport-fit=cover). */
		top: env(safe-area-inset-top, 0px);
		left: env(safe-area-inset-left, 0px);
		right: env(safe-area-inset-right, 0px);
		bottom: env(safe-area-inset-bottom, 0px);
		overflow: hidden;
		background: #0b0e12;
		z-index: 1;
		touch-action: none;
	}
	.backbuffer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		border: 0;
		display: block;
		z-index: 1;
		background: #000;
		touch-action: none;
	}
	.play-error {
		position: absolute;
		left: 50%;
		bottom: 1rem;
		transform: translateX(-50%);
		z-index: 4;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		max-width: min(40rem, 92vw);
		padding: 0.6rem 0.9rem;
		border: 1px solid rgba(227, 93, 106, 0.5);
		border-radius: 0.4rem;
		background: rgba(11, 14, 18, 0.92);
		color: #e8edf4;
		font-size: 0.85rem;
	}
	.play-error p {
		margin: 0;
		flex: 1;
		color: #e35d6a;
		word-break: break-word;
	}
	.play-error button {
		padding: 0.35rem 0.8rem;
		border: 1px solid rgba(232, 237, 244, 0.28);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.06);
		color: #e8edf4;
		cursor: pointer;
	}
	#otc-text-sinks {
		position: fixed;
		inset: 0;
		z-index: 5;
		pointer-events: none;
	}
	/* Critical overlay rules — must not depend on play-shell.css (COEP). */
	:global(.play-transition) {
		position: absolute;
		inset: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-direction: column;
		gap: 1rem;
		background: #0b0e12;
		background-size: cover;
		background-position: center;
		background-repeat: no-repeat;
		color: #e8edf4;
		font-family: Verdana, system-ui, sans-serif;
		transition: opacity 220ms ease;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
	}
	:global(.play-transition p),
	:global(#play-transition-status) {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		opacity: 0.9;
	}
	:global(.play-transition-bar) {
		width: min(16rem, 60vw);
		height: 4px;
		border-radius: 2px;
		background: rgba(255, 255, 255, 0.12);
		overflow: hidden;
	}
	:global(.play-transition-fill) {
		height: 100%;
		width: 8%;
		background: linear-gradient(90deg, #c9a227, #e8d48b);
		transition: width 180ms ease;
	}
	/* Qt WASM defaults .qt-decorated-window to lightgray. */
	:global(#tibia-screen .qt-decorated-window),
	:global(#play-stage .qt-decorated-window) {
		background-color: #0b0e12 !important;
	}
</style>
