<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let exp = $derived(data.experiment);
	let preferences = $derived(data.preferences);

	function statusBadge(s: string) {
		switch (s) {
			case 'pending':
				return 'bg-amber-100 text-amber-800';
			case 'assigned':
				return 'bg-green-100 text-green-800';
			case 'declined':
				return 'bg-gray-200 text-gray-700';
			case 'withdrawn':
				return 'bg-gray-200 text-gray-500';
			default:
				return 'bg-gray-100 text-gray-700';
		}
	}
</script>

<svelte:head>
	<title>Preferences — {exp.name}</title>
</svelte:head>

<a href={`/experiments/${exp.id}`} class="text-sm text-gray-500 hover:text-gray-900"
	>← {exp.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Preferences</h1>
<p class="mt-2 text-sm text-gray-600">
	Standing availability queue. Assign pending preferences to concrete sessions, or decline if
	nothing fits.
</p>

<nav class="mt-6 flex gap-4 border-b border-gray-200 text-sm">
	<a href={`/experiments/${exp.id}`} class="pb-2 text-gray-500 hover:text-gray-900">Settings</a>
	<a href={`/experiments/${exp.id}/sessions`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Sessions</a
	>
	<span class="border-b-2 border-gray-900 pb-2 font-medium">Preferences</span>
</nav>

{#if form?.assigned}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
		Assigned to {form.created} session{form.created === 1 ? '' : 's'}.
	</p>
{/if}
{#if form?.declined}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Preference declined.</p>
{/if}
{#if form?.error}
	<p class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{form.error}</p>
{/if}

<section class="mt-6 space-y-4">
	{#each preferences as p (p.id)}
		<article class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-start justify-between gap-4">
				<div>
					<div class="flex items-center gap-2">
						<span class="font-medium">{p.snapshotName}</span>
						<span
							class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}
							>{p.status}</span
						>
						<span class="text-xs text-gray-500">{p.kind}</span>
					</div>
					<p class="font-mono text-xs text-gray-500">{p.snapshotEmail}</p>
					<p class="text-xs text-gray-400">submitted {p.createdAtLabel}</p>
				</div>
			</div>

			{#if p.kind === 'recurring'}
				<p class="mt-3 text-sm text-gray-700">
					{p.rrule ?? ''} starting {p.dtstartLocal} · {p.durationMinutes} min
				</p>
			{/if}
			{#if p.notes}
				<p class="mt-2 rounded bg-gray-50 p-2 text-xs whitespace-pre-line text-gray-700">
					{p.notes}
				</p>
			{/if}

			{#if p.status === 'pending'}
				{#if p.matches.length === 0}
					<p class="mt-4 text-sm text-gray-500">
						No matching sessions available in the window. You can still decline.
					</p>
				{:else}
					<form method="post" action="?/assign" use:enhance class="mt-4 space-y-2">
						<input type="hidden" name="preferenceId" value={p.id} />
						<p class="text-xs font-medium text-gray-600 uppercase">Matching sessions</p>
						{#each p.matches as m (m.id)}
							<label class="flex items-center gap-2 text-sm">
								<input type="checkbox" name="sessionIds" value={m.id} class="h-4 w-4" />
								<span>{m.startsAtLabel}</span>
								<span class="font-mono text-xs text-gray-400">cap {m.capacity}</span>
							</label>
						{/each}
						<div class="mt-3 flex gap-2">
							<button
								type="submit"
								class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
								>Assign selected</button
							>
						</div>
					</form>
				{/if}
				<form method="post" action="?/decline" use:enhance class="mt-3">
					<input type="hidden" name="preferenceId" value={p.id} />
					<button
						type="submit"
						class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
						>Decline</button
					>
				</form>
			{/if}
		</article>
	{:else}
		<p class="text-sm text-gray-500">No preferences yet.</p>
	{/each}
</section>
