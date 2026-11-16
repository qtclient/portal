<script lang="ts">
	import { faGripLines } from '@fortawesome/free-solid-svg-icons';
	import { flip } from 'svelte/animate';
	import {
		dndzone,
		SHADOW_PLACEHOLDER_ITEM_ID,
		SOURCES,
		TRIGGERS,
	} from 'svelte-dnd-action';
	import Fa from 'svelte-fa';

	import type { SubmitFunction } from '$app/forms';

	import Button from '#lib/components/ui/Button.svelte';
	import { confirm } from '#lib/confirm.svelte.js';
	import { enhance } from '#lib/enchance.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	type StaticPageListItem = {
		id: string;
		slug: string;
		title: string;
	};

	let staticPages = $derived(data.staticPages as StaticPageListItem[]);

	function awaitConfirmation(): Promise<boolean> {
		return confirm('Delete?', 'Are you sure you wish to proceed?');
	}

	const submitDeletion: SubmitFunction = async ({ cancel }) => {
		if (!(await awaitConfirmation())) {
			cancel();
		}
	};

	const flipDurationMs = 300;
	let dragDisabled = $state(true);
	let form: HTMLFormElement | undefined = $state();

	function handleDndConsider(e: CustomEvent<DndEvent<StaticPageListItem>>) {
		const {
			items: newItems,
			info: { source, trigger },
		} = e.detail;

		staticPages = newItems;
		if (source === SOURCES.KEYBOARD && trigger === TRIGGERS.DRAG_STOPPED) {
			dragDisabled = true;
		}
	}
	function handleDndFinalize(e: CustomEvent<DndEvent<StaticPageListItem>>) {
		const {
			items: newItems,
			info: { source, trigger },
		} = e.detail;

		staticPages = newItems;
		if (source === SOURCES.POINTER) {
			dragDisabled = true;
		}
		if (trigger === TRIGGERS.DROPPED_INTO_ZONE) {
			form?.requestSubmit();
		}
	}

	function startDrag(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		dragDisabled = false;
	}
	function handleKeyDown(e: KeyboardEvent) {
		if ((e.key === 'Enter' || e.key === ' ') && dragDisabled)
			dragDisabled = false;
	}
</script>

<form
	method="post"
	hidden
	action="/admin/static-pages?/reorder"
	bind:this={form}
	data-enhance-noreset
	use:enhance>
	{#each staticPages.filter(({ id }) => id !== SHADOW_PLACEHOLDER_ITEM_ID) as staticPage (staticPage.id)}
		<input hidden name="staticPages" value={staticPage.id} />
	{/each}
</form>

<h1 class="h1">Static Pages</h1>
<Button href="/admin/static-pages/new">Create</Button>

<div class="table-wrap">
	<table class="table table-hover">
		<thead>
			<tr>
				<th class="w-12"></th>
				<th>Title</th>
				<th class="w-48">Slug</th>
				<th class="w-32">Actions</th>
			</tr>
		</thead>
		<tbody
			use:dndzone={{
				items: staticPages,
				flipDurationMs,
				dragDisabled,
			}}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}>
			{#each staticPages as staticPage (staticPage.id)}
				<tr
					class="[&>td]:!align-middle"
					animate:flip={{ duration: flipDurationMs }}>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<td
						tabindex={dragDisabled ? 0 : -1}
						aria-label="drag-handle"
						style={dragDisabled ? 'cursor: grab' : 'cursor: grabbing'}
						onmousedown={startDrag}
						ontouchstart={startDrag}
						onkeydown={handleKeyDown}>
						<span class="flex justify-center">
							<Fa icon={faGripLines} />
						</span>
					</td>
					<td>{staticPage.title}</td>
					<td>/pages/{staticPage.slug}</td>
					<td>
						<div class="flex flex-row items-center gap-2">
							<Button href="/admin/static-pages/{staticPage.id}" size="sm"
								>Edit</Button>
							<form
								action="/admin/static-pages/{staticPage.id}"
								method="post"
								use:enhance={submitDeletion}>
								<input type="hidden" name="_method" value="DELETE" />
								<Button type="submit" size="sm" color="error">Delete</Button>
							</form>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
