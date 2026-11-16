<script lang="ts">
	import { untrack } from 'svelte';

	import type { CommunityPanelId } from '#lib/community/panels.js';
	import PlayCommunityPanel from '#lib/components/community/PlayCommunityPanel.svelte';

	interface Props {
		panelId: CommunityPanelId;
	}

	let { panelId }: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let data: any = $state(null);
	let params = $state(new URLSearchParams());
	let loading = $state(false);
	let error = $state('');

	async function loadPanel() {
		loading = true;
		error = '';
		try {
			const qs = new URLSearchParams(params);
			qs.set('panel', panelId);
			const response = await fetch(`/api/community?${qs.toString()}`);
			if (!response.ok) {
				throw new Error('Failed to load panel');
			}
			data = await response.json();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load panel';
			data = null;
		} finally {
			loading = false;
		}
	}

	function onParamsChange(next: URLSearchParams) {
		params = next;
		void loadPanel();
	}

	$effect(() => {
		if (panelId) untrack(() => resetPanel());
	});

	function resetPanel() {
		params = new URLSearchParams();
		if (panelId === 'characters') {
			loading = false;
			error = '';
			data = { title: 'Characters' };
		} else {
			void loadPanel();
		}
	}
</script>

{#if loading}
	<p class="community-popover__status">Loading...</p>
{:else if error}
	<p class="community-popover__error">{error}</p>
{:else if data}
	<PlayCommunityPanel {panelId} {data} onparamschange={onParamsChange} />
{/if}

<style>
	.community-popover__status,
	.community-popover__error {
		margin: 0;
		font-size: 0.8125rem;
	}
	.community-popover__error {
		color: #e35d6a;
	}
</style>
