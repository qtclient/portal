<script lang="ts">
	import {
		faCalendarAlt,
		faCoins,
		faCrown,
	} from '@fortawesome/free-solid-svg-icons';
	import Fa from 'svelte-fa';
	import { _ } from 'svelte-i18n';

	import { formatDate } from '#lib/utils.js';

	interface Props {
		name: string;
		createdAt: Date;
		balance: bigint;
		ownerName: string;
	}

	let { name, createdAt, balance, ownerName }: Props = $props();
</script>

<div class="text-sm font-light text-surface-800 dark:text-surface-100">
	<span class="flex flex-row items-center gap-1">
		<Fa icon={faCrown} class="text-primary-600 dark:text-primary-300" />
		{@html $_('guilds.leader-label', { values: { name: ownerName } })}
	</span>
	<span class="flex flex-row items-center gap-1">
		<Fa icon={faCalendarAlt} class="text-tertiary-500 dark:text-tertiary-300" />
		{$_('guilds.founded', {
			values: {
				name: name,
				date: formatDate(createdAt, { short: true }),
			},
		})}
	</span>
	<span class="flex flex-row items-center gap-1">
		<Fa icon={faCoins} class="text-warning-700 dark:text-warning-500" />
		{@html $_('guilds.balance', {
			values: { balance: balance.toString() },
		})}
	</span>
</div>
