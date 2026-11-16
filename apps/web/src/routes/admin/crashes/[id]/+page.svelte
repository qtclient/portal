<script lang="ts">
	import { format } from 'date-fns';

	import type { PageData } from './$types';

	type Frame = {
		module?: string | null;
		function?: string | null;
		file?: string | null;
		line?: number | null;
		offset?: string | null;
	};

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let group = $derived(data.group);
	let latest = $derived(group.reports[0]);
	let frames = $derived((latest?.frames as Frame[] | null) ?? []);

	function where(f: Frame): string {
		if (f.file) return `${f.file}${f.line ? `:${f.line}` : ''}`;
		return f.offset ?? '';
	}
</script>

<div class="flex flex-col gap-4">
	<header class="flex flex-col gap-1">
		<a class="anchor text-sm" href="/admin/crashes">← Crashes</a>
		<h2 class="h2 break-all">{group.title}</h2>
		<p class="text-sm opacity-70">
			{group.count} reports · {group.platform} · first
			{format(group.first_seen, 'yyyy-MM-dd HH:mm')} · last
			{format(group.last_seen, 'yyyy-MM-dd HH:mm')}
			(<code>{group.last_revision}</code>)
		</p>
		<p class="text-xs opacity-60">signature <code>{group.signature}</code></p>
	</header>

	<form method="post" action="?/resolve" class="card p-4 flex flex-col gap-2">
		<label class="flex items-center gap-2">
			<input
				type="checkbox"
				class="checkbox"
				name="resolved"
				value="true"
				checked={group.resolved} />
			<span>Resolved (a new report reopens it)</span>
		</label>
		<textarea class="textarea" name="note" rows="2" placeholder="Notes"
			>{group.note ?? ''}</textarea>
		<div class="flex gap-2">
			<button class="btn btn-sm preset-filled" type="submit">Save</button>
			<button
				class="btn btn-sm preset-tonal"
				formaction="?/reprocess"
				type="submit">Re-symbolicate</button>
		</div>
	</form>

	{#if latest}
		<section class="flex flex-col gap-2">
			<h3 class="h3">Crashing thread (latest report)</h3>
			<p class="text-sm opacity-70">
				{latest.crash_type ?? 'crash'} · {latest.status}
			</p>
			<ol class="font-mono text-xs flex flex-col gap-0.5">
				{#each frames as frame, i (i)}
					<li>
						<span class="opacity-50">{i}</span>
						<span>{frame.module ?? '?'}</span>!<strong
							>{frame.function ?? '???'}</strong>
						<span class="opacity-60">{where(frame)}</span>
					</li>
				{:else}
					<li class="opacity-60">
						No frames yet (pending, symbols missing, or minidump-stackwalk not
						installed).
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	<section class="flex flex-col gap-2">
		<h3 class="h3">Reports</h3>
		<div class="table-wrap">
			<table class="table table-auto">
				<thead>
					<tr class="[&>th]:!p-2">
						<th>When</th>
						<th>Revision</th>
						<th>Type</th>
						<th>Status</th>
						<th>Account</th>
						<th>Comment</th>
					</tr>
				</thead>
				<tbody>
					{#each group.reports as r (r.id)}
						<tr class="[&>td]:!p-2 align-top">
							<td class="whitespace-nowrap"
								>{format(r.created_at, 'yyyy-MM-dd HH:mm')}</td>
							<td><code>{r.revision}</code></td>
							<td>{r.report_type}</td>
							<td>{r.status}</td>
							<td>
								{#if r.account_id}
									<a class="anchor" href="/admin/accounts/{r.account_id}"
										>{r.account_id}</a>
								{/if}
							</td>
							<td class="whitespace-pre-wrap">{r.comment ?? ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>
