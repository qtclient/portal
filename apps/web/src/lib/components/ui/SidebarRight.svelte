<script lang="ts">
	import { faMedal, faPerson } from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Tip from '#lib/components/ui/Tip.svelte';
	import { type Player, vocationString } from '#lib/players.js';

	interface Props {
		highscores?: Player[];
		accountCharacters?: Player[] | null;
	}

	let { highscores = [], accountCharacters = null }: Props = $props();
</script>

<div class="card card-tertiary overflow-hidden">
	<header
		class="flex flex-row justify-center items-center gap-2 py-1 px-2 preset-filled-secondary-500 rounded-container">
		<Fa icon={faMedal} />
		<h6 class="h6">{$_('highscores')}</h6>
	</header>
	<hr class="opacity-5" />
	<article class="py-2 px-4 flex flex-col gap-2">
		{#each highscores as character, i}
			<a
				href="/characters/{character.name}"
				class="flex flex-row items-center hover:bg-tertiary-400/50 -mx-4 px-4">
				<span
					class="badge-icon preset-filled !text-white"
					class:!bg-yellow-600={i === 0}
					class:!bg-slate-500={i === 1}
					class:!bg-amber-700={i === 2}
					class:!bg-stone-600={i >= 3}>
					{i + 1}
				</span>
				<AnimatedOutfit
					outfit={character}
					alt={character.name}
					class="scale-75" />
				<span class="flex flex-col w-24">
					<Tip content={character.name}
						>{#snippet trigger(attrs)}<span
								{...attrs}
								class="text-sm font-semibold overflow-clip text-ellipsis whitespace-nowrap w-full">
								{character.name}
							</span>{/snippet}</Tip>
					<span
						class="font-light text-xs flex flex-col overflow-clip text-ellipsis whitespace-nowrap w-full">
						<span>
							{$_('level')}: <span class="font-normal">{character.level}</span>
						</span>
						<Tip content={vocationString(character.vocation)} placement="bottom"
							>{#snippet trigger(attrs)}<span {...attrs}>
									{vocationString(character.vocation)}
								</span>{/snippet}</Tip>
					</span>
				</span>
			</a>
		{/each}
	</article>
	<hr class="opacity-5" />
	<footer class="py-2 px-2">
		<Button href="/highscores" class="w-full">
			{$_('view-more')}
		</Button>
	</footer>
</div>

{#if accountCharacters}
	<div class="card card-tertiary overflow-hidden">
		<header
			class="flex flex-row justify-center items-center gap-2 py-1 px-2 preset-filled-primary-500 rounded-container">
			<Fa icon={faPerson} />
			<h6 class="h6">{$_('your-characters')}</h6>
		</header>
		<hr class="opacity-5" />
		<article class="py-2 px-4 flex flex-col gap-2">
			{#each accountCharacters as character}
				<a
					href="/characters/{character.name}"
					class="flex flex-row items-center hover:bg-tertiary-400/50 -mx-4 px-4">
					<AnimatedOutfit
						outfit={character}
						alt={character.name}
						class="scale-75" />
					<span class="flex flex-col w-24">
						<Tip content={character.name}
							>{#snippet trigger(attrs)}<span
									{...attrs}
									class="text-sm font-semibold overflow-clip text-ellipsis whitespace-nowrap w-full">
									{character.name}
								</span>{/snippet}</Tip>
						<span
							class="font-light text-xs flex flex-col overflow-clip text-ellipsis whitespace-nowrap w-full">
							<span>
								{$_('level')}:
								<span class="font-normal">{character.level}</span>
							</span>
							<Tip
								content={vocationString(character.vocation)}
								placement="bottom"
								>{#snippet trigger(attrs)}<span {...attrs}>
										{vocationString(character.vocation)}
									</span>{/snippet}</Tip>
						</span>
					</span>
				</a>
			{/each}
		</article>
	</div>
{/if}
