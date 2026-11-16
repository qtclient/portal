<script lang="ts">
	import { _ } from 'svelte-i18n';

	import { goto } from '$app/navigation';

	import type { CommunityPanelContext } from '#lib/community/panels.js';
	import CharactersTable from '#lib/components/ui/CharactersTable.svelte';
	import Select from '#lib/components/ui/forms/Select.svelte';
	import Paginator from '#lib/components/ui/Paginator.svelte';

	interface Props {
		onparamschange?: (detail: URLSearchParams) => void;
		data: {
			characters: import('#lib/players.js').PlayerWithRank[];
			skill: string;
			vocation: string;
			page: number;
			limit: number;
			offset: number;
			count: number;
		};
		context?: CommunityPanelContext;
	}

	let {
		data = $bindable(),
		context = 'page',
		onparamschange,
	}: Props = $props();

	let linkTarget = $derived(context === 'overlay' ? '_blank' : undefined);
	let linkRel = $derived(
		context === 'overlay' ? 'noopener noreferrer' : undefined,
	);

	let skills = $derived(
		[
			'experience',
			'magic',
			'fist',
			'club',
			'sword',
			'axe',
			'distance',
			'shielding',
			'fishing',
			'balance',
		].map((skill) => $_(`skills.${skill}`)),
	);

	const vocations = ['all', 'none', 'knight', 'paladin', 'sorcerer', 'druid'];

	let form: HTMLFormElement | undefined = $state();

	function buildParams(page = data.page, limit = data.limit) {
		return new URLSearchParams({
			skill: data.skill,
			vocation: data.vocation,
			page: String(page),
			limit: String(limit),
		});
	}

	function applyParams(params: URLSearchParams) {
		if (context === 'overlay') {
			onparamschange?.(params);
			return;
		}
		void goto(`/highscores?${params.toString()}`);
	}

	function onFilterSubmit() {
		applyParams(buildParams(1));
	}

	function onPageChange({ page, limit }: { page: number; limit: number }) {
		applyParams(buildParams(page, limit));
	}
</script>

<div class="flex flex-col gap-2">
	<form
		bind:this={form}
		class="flex flex-row gap-2 flex-wrap"
		method="get"
		onsubmit={(event) => {
			event.preventDefault();
			void onFilterSubmit();
		}}>
		<Select
			name="skill"
			label={$_('skill')}
			variant="horizontal"
			onchange={onFilterSubmit}
			bind:value={data.skill}>
			{#each skills as skill}
				<option value={skill.toLowerCase()}>{skill}</option>
			{/each}
		</Select>
		<Select
			name="vocation"
			label={$_('vocation')}
			variant="horizontal"
			onchange={onFilterSubmit}
			bind:value={data.vocation}>
			{#each vocations as vocation}
				<option value={vocation}>{$_(`vocations.${vocation}`)}</option>
			{/each}
		</Select>
	</form>
	<CharactersTable
		characters={data.characters}
		skill={data.skill}
		ranked
		{linkTarget}
		{linkRel} />
	<Paginator
		page={data.page}
		limit={data.limit}
		count={data.count}
		amounts={[50, 100, 200]}
		onchange={onPageChange} />
</div>
