<script lang="ts">
	import type { StaticPage } from '@prisma/client';
	import { markdown } from '@codemirror/lang-markdown';
	import { oneDark } from '@codemirror/theme-one-dark';
	import CodeMirror from 'svelte-codemirror-editor';

	import { applyAction, enhance } from '$app/forms';

	import Button from '#lib/components/ui/Button.svelte';
	import TextField from '#lib/components/ui/forms/TextField.svelte';
	import Toggle from '#lib/components/ui/forms/Toggle.svelte';
	import { hotkeys } from '#lib/hotkeys.js';
	import { toaster } from '#lib/toaster.js';

	interface Props {
		staticPage?: StaticPage | null;
		errors?: Record<string, string[]> | null;
	}

	let { staticPage = null, errors = null }: Props = $props();
	let { title, slug } = $derived(
		staticPage ?? {
			title: '',
			slug: '',
		},
	);
	let value = $state(staticPage?.content ?? '');

	let form: HTMLFormElement | undefined = $state();

	let hideFromMenu = $state(staticPage?.hide ?? false);

	function save() {
		form?.requestSubmit();
	}
</script>

<form
	bind:this={form}
	method="post"
	class="flex flex-col gap-2 max-w-3xl"
	data-hotkeys-global
	use:hotkeys={[
		{ key: 's', metaKey: true, fn: save },
		{ key: 's', ctrlKey: true, fn: save },
	]}
	use:enhance={() => {
		return async ({ result }) => {
			if (result.type === 'success') {
				toaster.success({ title: 'Saved', duration: 1000 });
			}
			return applyAction(result);
		};
	}}>
	{#if errors?.global}
		<p class="text-xs text-error-500">{errors.global}</p>
	{/if}

	<TextField
		required
		label="Title"
		name="title"
		value={title}
		errors={errors?.title} />

	<TextField
		required
		label="Slug"
		name="slug"
		value={slug}
		errors={errors?.slug} />

	<div class="label flex flex-row items-center gap-2">
		<input
			class="hidden"
			type="checkbox"
			name="hide"
			bind:checked={hideFromMenu} />
		<span>Hide from menu</span>
		<Toggle bind:checked={hideFromMenu} />
	</div>

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

	<div class="flex flex-row gap-2 w-full">
		<Button href="/admin/static-pages" color="secondary" class="grow"
			>Go back</Button>
		<Button type="submit" class="grow">Save</Button>
	</div>
</form>
