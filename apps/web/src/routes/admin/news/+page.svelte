<script lang="ts">
	import type { SubmitFunction } from '$app/forms';

	import Button from '#lib/components/ui/Button.svelte';
	import Toggle from '#lib/components/ui/forms/Toggle.svelte';
	import { confirm } from '#lib/confirm.svelte.js';
	import { enhance } from '#lib/enchance.js';
	import { formatDate } from '#lib/utils.js';

	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	async function updatePublished(id: string, published: boolean) {
		const formData = new FormData();
		formData.append('published', published ? 'on' : '');
		await fetch(`/admin/news/${id}`, {
			method: 'POST',
			body: formData,
		});
	}

	function awaitConfirmation(): Promise<boolean> {
		return confirm('Delete?', 'Are you sure you wish to proceed?');
	}

	const submitDeletion: SubmitFunction = async ({ cancel }) => {
		if (!(await awaitConfirmation())) {
			cancel();
		}
	};
</script>

<h1 class="h1">News</h1>
<Button href="/admin/news/new">Create</Button>

<div class="table-wrap">
	<table class="table table-hover">
		<thead>
			<tr>
				<th>Title</th>
				<th class="w-40">Compendium</th>
				<th class="w-48">Author</th>
				<th class="w-48">Date</th>
				<th class="w-16">Published?</th>
				<th class="w-32">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.news as news}
				<tr class="[&>td]:!align-middle">
					<td>{news.title}</td>
					<td class="text-sm opacity-80">{news.category}</td>
					<td>{news.author.name}</td>
					<td>{formatDate(news.created_at)}</td>
					<td
						><Toggle
							checked={news.published}
							oncheckedchange={(checked: boolean) =>
								void updatePublished(news.id, checked)} />
					</td>
					<td>
						<div class="flex flex-row items-center gap-2">
							<Button href="/admin/news/{news.id}" size="sm">Edit</Button>
							<form
								action="/admin/news/{news.id}"
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
