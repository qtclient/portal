<script lang="ts">
	import type { CommunityPanelId } from '#lib/community/panels.js';
	import CharactersPanel from '#lib/components/community/CharactersPanel.svelte';
	import HighscoresPanel from '#lib/components/community/HighscoresPanel.svelte';
	import LastKillsPanel from '#lib/components/community/LastKillsPanel.svelte';
	import OnlinePanel from '#lib/components/community/OnlinePanel.svelte';

	interface Props {
		onparamschange?: (detail: URLSearchParams) => void;

		panelId: CommunityPanelId;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		data: any;
	}

	let { panelId, data, onparamschange }: Props = $props();
</script>

{#if panelId === 'highscores'}
	<HighscoresPanel {data} context="overlay" {onparamschange} />
{:else if panelId === 'last-kills'}
	<LastKillsPanel {data} context="overlay" />
{:else if panelId === 'characters'}
	<CharactersPanel context="overlay" />
{:else if panelId === 'online'}
	<OnlinePanel {data} context="overlay" {onparamschange} />
{/if}
