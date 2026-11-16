<script lang="ts">
	import { formatDistanceToNow } from 'date-fns';
	import { _ } from 'svelte-i18n';

	import AnimatedOutfit from '#lib/components/ui/AnimatedOutfit.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import MainCharacterIndicator from '#lib/components/ui/MainCharacterIndicator.svelte';
	import OnlineIndicator from '#lib/components/ui/OnlineIndicator.svelte';
	import Tip from '#lib/components/ui/Tip.svelte';
	import { pronounsEnabled } from '#lib/config.js';
	import { getPronoun, type Player, vocationString } from '#lib/players.js';

	interface Props {
		characters: Player[];
	}

	let { characters }: Props = $props();
</script>

<div class="flex flex-col gap-2">
	<h3 class="h3">{$_('characters')}</h3>

	<div class="table-wrap">
		<table class="table table-hover table-auto">
			<thead>
				<tr class="[&>th]:!p-2">
					<th class="w-10"></th>
					<th class="w-20">{$_('outfit')}</th>
					<th>{$_('name')}</th>
					<th class="w-48"></th>
				</tr>
			</thead>
			<tbody>
				{#each characters as character, i}
					<tr class="[&>td]:!align-middle">
						<td>{i + 1}</td>
						<td>
							<AnimatedOutfit outfit={character} alt={character.name} />
						</td>
						<td>
							<div class="flex flex-col">
								<span class="font-semibold flex flex-row gap-1 items-center">
									<OnlineIndicator online={character.online} />
									<a
										href="/characters/{character.name}"
										class="anchor text-surface-900">
										{character.name}
									</a>
									{#if pronounsEnabled}
										<em class="font-light">({getPronoun(character)})</em>
									{/if}
									{#if character.isMain}
										<MainCharacterIndicator />
									{/if}
								</span>
								<span class="text-xs">
									{vocationString(character.vocation)} &dash; Level {character.level}
								</span>
								{#if character.charbazaar}
									<span class="text-xs text-warning-500"
										>{$_('bazaar.listed-badge')}</span>
								{/if}
							</div>
						</td>
						<td>
							<div class="flex flex-col gap-1 items-center">
								{#if character.charbazaar}
									<span class="text-xs text-warning-500"
										>{$_('bazaar.listed-badge')}</span>
									<a href="/account/bazaar" class="anchor"
										>{$_('bazaar.my-auctions')}</a>
								{:else if !character.deletion}
									{#if !character.isMain}
										<form
											class="flex"
											action="/account/characters/set-main"
											method="POST">
											<input type="hidden" name="name" value={character.name} />
											<button class="anchor" type="submit">
												{$_('set-as-main')}
											</button>
										</form>
									{/if}
									<a
										href="/account/characters/{character.name}/edit"
										class="anchor"
										type="submit">
										{$_('edit')}
									</a>
									<a
										href="/account/characters/{character.name}/delete"
										class="anchor"
										type="submit">
										{$_('delete')}
									</a>
								{:else}
									<Tip
										content={`"${
											character.name
										}"" will be deleted in ${formatDistanceToNow(
											Number(character.deletion),
										)}`}
										>{#snippet trigger(attrs)}<span
												{...attrs}
												class="text-error-600">
												{$_('deleted')}
											</span>{/snippet}</Tip>
									<form
										class="flex"
										action="/account/characters/{character.name}/delete?cancel=true"
										method="POST">
										(<button class="anchor" type="submit"
											>{$_('undelete')}</button
										>)
									</form>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex flex-row justify-end">
		<Button href="/account/characters/create" size="sm"
			>{$_('new-character')}</Button>
	</div>
</div>
