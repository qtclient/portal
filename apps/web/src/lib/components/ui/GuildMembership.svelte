<script lang="ts">
	import { _ } from 'svelte-i18n';

	import type { GuildMembership } from '#lib/guilds.js';

	interface Props {
		guild: GuildMembership;
	}

	let { guild }: Props = $props();
</script>

{#if guild.nick}
	{@html $_('guilds.membership-description-with-nick', {
		values: guild,
	})}
{:else}
	{@html $_('guilds.membership-description', {
		values: guild,
	})}
{/if}
