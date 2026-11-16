<script lang="ts">
	import { pack } from '#lib/pack.js';
	import { onMount } from 'svelte';

	import * as publicEnv from '$app/env/public';

	import { diag, installPlayDiag } from '#lib/client/play-diag.js';
	import {
		applyProductPlayCss,
		bootstrapClientPackage,
		bootstrapLauncherPackage,
		bootTibia,
		hidePlayTransition,
		installGameKeyGuard,
		installThingsForLauncher,
		PLAY_TRANSITION_KEY,
		resumePlayTransition,
		shouldAutoSkipQtclientLauncher,
		takePlayHandoff,
		tipUrl,
		updatePlayTransition,
	} from '#lib/client/tibia-browser.js';
	import { browserTitle } from '#lib/utils.js';

	import type { PageData } from './$types';

	const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let runtimeError = $state('');

	/**
	 * /play boot: desktop-like two-binary model.
	 * Cold qtclient → launcher.wasm (Widgets only). Warm tip or qtclient Play remount →
	 * tibia.wasm game-only (SKIP_LAUNCHER). Never Widgets + QML in one Module.
	 */
	async function bootPlay(cdn: string) {
		const handoff = takePlayHandoff();
		const auto = await shouldAutoSkipQtclientLauncher(cdn);
		diag('autoSkipSoft', auto);
		// qtclient Play remount, or tip already InstalledAndUsable (CIP stamp skip).
		const skipLauncher = handoff || auto.skip;
		const softOnly = !skipLauncher;
		try {
			sessionStorage.setItem(PLAY_TRANSITION_KEY, '1');
		} catch {
			/* ignore */
		}
		diag('bootPlay', {
			handoff,
			skipLauncher,
			softOnly,
			cdn,
			tipWarm: auto.skip,
		});
		resumePlayTransition();
		updatePlayTransition(
			skipLauncher ? 'Launching client…' : 'Loading qtclient…',
			8,
		);
		const clientBase = tipUrl(cdn, 'launcher/tibiaclient-web-current');
		const softBase = tipUrl(cdn, 'launcher/launcher-web-current');
		const wasmBase = softOnly ? softBase : clientBase;
		const assetBase = new URL(cdn, location.origin).href.replace(/\/+$/, '');
		const stage = document.getElementById('play-stage');
		if (!stage) throw new Error('Missing #play-stage');

		let engineStamp = '';
		let revision = '';
		let packWasmBase = '';
		try {
			const [stampRes, releaseRes, webRes] = await Promise.all([
				fetch(`${clientBase}/package.json.version`, { cache: 'no-store' }),
				fetch(`${assetBase}/latest/release.json`, { cache: 'no-store' }),
				fetch(`${assetBase}/latest/client-version.json`, { cache: 'no-store' }),
			]);
			if (stampRes.ok) engineStamp = (await stampRes.text()).trim();
			if (releaseRes.ok) {
				const release = (await releaseRes.json()) as {
					revision?: string;
					targets?: { web?: { wasm?: string } };
				};
				revision = release.revision?.trim() ?? '';
				const wasmRel = release.targets?.web?.wasm?.trim() ?? '';
				if (wasmRel) packWasmBase = tipUrl(cdn, wasmRel);
			}
			if (!revision && webRes.ok) {
				const web = (await webRes.json()) as { revision?: string };
				revision = web.revision?.trim() ?? '';
			}
			diag('engine stamps', {
				engineStamp: engineStamp || null,
				revision: revision || null,
				packWasmBase: packWasmBase || null,
				stampOk: stampRes.ok,
				releaseOk: releaseRes.ok,
				webOk: webRes.ok,
			});
		} catch (err) {
			diag('engine stamps failed', {
				err: err instanceof Error ? err.message : String(err),
			});
		}

		// CipSoft art as soon as tip URLs are known — avoid black stage during
		// IDB/OPFS (pack stage used to apply this ~17s later).
		applyProductPlayCss({
			assetBase,
			packWasmBase: packWasmBase || undefined,
			engineStamp: engineStamp || undefined,
		});

		// While soft launcher bootstraps, warm the game tip IDB for remount.
		if (softOnly) {
			void bootstrapClientPackage(cdn)
				.then((r) => diag('prefetchClientPackage done', r))
				.catch((err: unknown) =>
					diag('prefetchClientPackage failed', {
						err: err instanceof Error ? err.message : String(err),
					}),
				);
		}

		const bootstrap = softOnly
			? bootstrapLauncherPackage
			: bootstrapClientPackage;
		const { fromCache, version } = await bootstrap(cdn, (p) => {
			updatePlayTransition(p.label, p.progress);
		});
		diag(
			softOnly
				? 'bootstrapLauncherPackage done'
				: 'bootstrapClientPackage done',
			{
				fromCache,
				version,
				skipLauncher,
				softOnly,
			},
		);
		updatePlayTransition(
			skipLauncher
				? fromCache
					? 'Starting game…'
					: 'Launching client…'
				: 'Preparing…',
			82,
		);

		// qtclient C++ installs things packs into OPFS tip via this portal hook.
		window.__qtclientInstallThings = installThingsForLauncher;

		diag('bootTibia start', {
			engine: softOnly ? 'launcher' : 'tibia',
			skipLauncher,
			wasmBase,
			packWasmBase,
		});
		bootTibia({
			engine: softOnly ? 'launcher' : 'tibia',
			wasmBase,
			revision,
			packWasmBase: packWasmBase || undefined,
			engineStamp: engineStamp || undefined,
			assetBase,
			skipLauncher,
			onStatus(text, progress) {
				updatePlayTransition(text, progress);
			},
			onReady() {
				// onLoaded is too early for both paths (before callMain / tip work).
				diag('bootTibia onReady', { skipLauncher, softOnly });
			},
			onLauncherReady() {
				diag('bootTibia onLauncherReady', { softOnly });
				if (softOnly) hidePlayTransition();
			},
			onFatal(message) {
				diag('bootTibia onFatal', { message, skipLauncher, softOnly });
				hidePlayTransition();
				runtimeError = message;
			},
			onGameReady() {
				diag('bootTibia onGameReady', { skipLauncher });
				hidePlayTransition();
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

		// Drop legacy remount query (?game=1) if present.
		const url = new URL(location.href);
		if (url.searchParams.has('game')) {
			url.searchParams.delete('game');
			history.replaceState(null, '', url.pathname + url.search + url.hash);
		}

		void bootPlay(data.cdn).catch((err: unknown) => {
			const message = err instanceof Error ? err.message : String(err);
			diag('bootPlay threw', { message });
			hidePlayTransition();
			runtimeError = message;
		});

		return () => {
			delete window.__qtclientInstallThings;
			delete window.__qtclientStartGame;
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
		top: env(safe-area-inset-top, 0px);
		left: 0;
		right: 0;
		bottom: 0;
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
</style>
