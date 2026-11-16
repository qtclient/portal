<script lang="ts">
	import type { PageData } from './$types';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const fmt = (n: number) => n.toFixed(1);
</script>

<div class="flex flex-col gap-6">
	<header class="flex flex-wrap items-end justify-between gap-2">
		<h2 class="h2">Client telemetry</h2>
		<form method="get" class="flex gap-2 items-end">
			<label class="flex flex-col gap-1">
				<span class="text-sm">Window</span>
				<select class="select" name="days" value={String(data.days)}>
					<option value="1">1 day</option>
					<option value="7">7 days</option>
					<option value="14">14 days</option>
					<option value="30">30 days</option>
					<option value="90">90 days</option>
				</select>
			</label>
			<button class="btn btn-sm preset-filled" type="submit">Apply</button>
		</form>
	</header>

	<section class="flex flex-col gap-2">
		<h3 class="h3">FPS by revision and renderer</h3>
		{#if data.fps.length === 0}
			<p class="opacity-70">No FPS history uploaded in this window.</p>
		{:else}
			<div class="table-wrap">
				<table class="table table-hover table-auto">
					<thead>
						<tr class="[&>th]:!p-2">
							<th>Revision</th>
							<th>Platform</th>
							<th>Renderer</th>
							<th class="text-right">Samples</th>
							<th class="text-right">Avg FPS</th>
							<th class="text-right">Avg min</th>
							<th class="text-right">Avg max</th>
						</tr>
					</thead>
					<tbody>
						{#each data.fps as row (row.revision + row.platform + row.renderer)}
							<tr class="[&>td]:!p-2">
								<td><code>{row.revision}</code></td>
								<td>{row.platform}</td>
								<td>{row.renderer}</td>
								<td class="text-right tabular-nums">{row.samples}</td>
								<td class="text-right tabular-nums">{fmt(row.avg_fps)}</td>
								<td class="text-right tabular-nums">{fmt(row.min_fps)}</td>
								<td class="text-right tabular-nums">{fmt(row.max_fps)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<div class="grid md:grid-cols-2 gap-6">
		<section class="flex flex-col gap-2">
			<h3 class="h3">GPUs (system surveys)</h3>
			<ul class="text-sm flex flex-col gap-1">
				{#each data.gpus as g (g.label)}
					<li class="flex justify-between gap-4">
						<span>{g.label}</span><span class="tabular-nums">{g.n}</span>
					</li>
				{:else}
					<li class="opacity-70">No surveys.</li>
				{/each}
			</ul>
		</section>
		<section class="flex flex-col gap-2">
			<h3 class="h3">Crash reports by platform</h3>
			<ul class="text-sm flex flex-col gap-1">
				{#each data.crashPlatforms as p (p.label)}
					<li class="flex justify-between gap-4">
						<span>{p.label}</span><span class="tabular-nums">{p.n}</span>
					</li>
				{:else}
					<li class="opacity-70">No crashes.</li>
				{/each}
			</ul>
		</section>
	</div>
</div>
