<script lang="ts">
	import { faMars, faVenus } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import RadioGroup from '#lib/components/ui/forms/RadioGroup.svelte';
	import RadioItem from '#lib/components/ui/forms/RadioItem.svelte';
	import Select from '#lib/components/ui/forms/Select.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import { pronounsEnabled, tutorialEnabled } from '#lib/config.js';
	import {
		allPronouns,
		PlayerPronoun,
		PlayerSex,
		pronounString,
		sexString,
	} from '#lib/players.js';
	import { toTitleCase } from '#lib/utils.js';

	type CharacterActionData = {
		errors?: {
			characterName?: string[];
		};
	} | null;

	interface Props {
		form: CharacterActionData;
	}

	let { form }: Props = $props();

	let sex = $state(PlayerSex.Female);
	let characterName = $state('');

	$effect(() => {
		characterName = toTitleCase(characterName);
	});
</script>

<div class="flex flex-row gap-4 items-center">
	<TextField
		required
		label={$_('name')}
		name="characterName"
		bind:value={characterName}
		errors={form?.errors?.characterName} />

	<div class="label flex flex-col gap-0">
		<span>{$_('sex')}</span>
		<RadioGroup>
			<RadioItem bind:group={sex} name="characterSex" value={PlayerSex.Female}>
				<div class="flex flex-row gap-1 items-center">
					<Fa icon={faVenus} />{sexString(PlayerSex.Female)}
				</div>
			</RadioItem>
			<RadioItem bind:group={sex} name="characterSex" value={PlayerSex.Male}>
				<div class="flex flex-row gap-1 items-center">
					<Fa icon={faMars} />{sexString(PlayerSex.Male)}
				</div>
			</RadioItem>
		</RadioGroup>
	</div>

	{#if pronounsEnabled}
		<Select
			name="characterPronouns"
			value={PlayerPronoun.Unset.toString()}
			label={$_('character-pronoun')}>
			{#each allPronouns as pronounValue}
				<option value={pronounValue.toString()}>
					{pronounString(pronounValue)}
				</option>
			{/each}
		</Select>
	{/if}
</div>

{#if tutorialEnabled}
	<label class="flex items-center space-x-2">
		<input class="checkbox" type="checkbox" name="tutorial" />
		<p>{$_('play-tutorial')}</p>
	</label>
{/if}
