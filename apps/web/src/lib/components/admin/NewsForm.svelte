<script lang="ts">
	import type { News } from '@prisma/client';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import CodeMirror from 'svelte-codemirror-editor';

	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import Toggle from '#lib/components/ui/forms/Toggle.svelte';
	import { enhance } from '#lib/enchance.js';

	/** CIP NewsDialog / Compendium tabs (clientservices type=news). */
	const COMPENDIUM_CATEGORIES = [
		'MAJOR UPDATES',
		'GAME CONTENTS',
		'PLAYER GUIDE',
		'CLIENT FEATURES',
		'USEFUL INFO',
		'SUPPORT',
	] as const;

	interface Props {
		news?: News | null;
		authorName?: string | null;
		errors?: Record<string, string[]> | null;
	}

	let { news = null, authorName = null, errors = null }: Props = $props();
	let published = $state(news ? news.published : false);
	let ticker = $state(
		news ? Boolean((news as { ticker?: boolean }).ticker) : false,
	);
	let category = $state(
		news?.category &&
			(COMPENDIUM_CATEGORIES as readonly string[]).includes(news.category)
			? news.category
			: 'MAJOR UPDATES',
	);
	let value = $state(news ? news.content : '');
</script>

<form method="post" class="flex flex-col gap-2 max-w-3xl" use:enhance>
	{#if errors?.global}
		<p class="text-xs text-error-500">{errors.global}</p>
	{/if}

	<TextField
		required
		label="Title"
		name="title"
		value={news?.title}
		errors={errors?.title} />

	<label class="label">
		<span>Compendium category</span>
		<select class="select" name="category" bind:value={category}>
			{#each COMPENDIUM_CATEGORIES as option}
				<option value={option}>{option}</option>
			{/each}
		</select>
		<span class="text-sm opacity-70"
			>Shown in the in-game Compendium (News) tab of the same name.</span>
		{#if errors?.category}
			<p class="text-xs text-error-500">{errors.category}</p>
		{/if}
	</label>

	<input type="hidden" name="content" bind:value />
	<div class="label">
		<span
			>Content (<a
				tabindex="-1"
				href="https://markdoc.dev/docs/syntax"
				class="anchor cursor-pointer">markdoc</a
			>)</span>
		<CodeMirror
			bind:value
			nodebounce
			lang={markdown()}
			theme={oneDark}
			styles={{
				'&': {
					minHeight: '30rem',
					maxHeight: '75vh',
				},
			}} />
		{#if errors?.content}
			<p class="text-xs text-error-500 dark:text-error-400">{errors.content}</p>
		{/if}
	</div>
	<div class="label flex flex-row items-center gap-2">
		<input
			class="hidden"
			type="checkbox"
			name="published"
			bind:checked={published} />
		<span>Publish</span>
		<Toggle bind:checked={published} />
		{#if published}
			<span class="text-success-500 dark:text-success-400">Yes</span>
			<span class="text-sm">(will be visible to the public)</span>
		{:else}
			<span class="text-error-500 dark:text-error-400">No</span>
			<span class="text-sm">(will not be visible to the public)</span>
		{/if}
	</div>

	<div class="label flex flex-row items-center gap-2">
		<input class="hidden" type="checkbox" name="ticker" bind:checked={ticker} />
		<span>Show as ticker</span>
		<Toggle bind:checked={ticker} />
		{#if ticker}
			<span class="text-success-500 dark:text-success-400">Yes</span>
			<span class="text-sm">(compact expandable headline on home)</span>
		{:else}
			<span class="text-error-500 dark:text-error-400">No</span>
			<span class="text-sm">(full article on home)</span>
		{/if}
	</div>

	<div>
		{#if authorName}
			This article will be published by your main character {authorName}.
		{/if}
	</div>

	<Button type="submit">Save</Button>
</form>
