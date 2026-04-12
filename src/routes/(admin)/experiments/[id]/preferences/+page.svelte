<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import Card from '$lib/components/Card.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let exp = $derived(data.experiment);
	let preferences = $derived(data.preferences);

	function statusBadge(s: string) {
		switch (s) {
			case 'pending':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
			case 'assigned':
				return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
			case 'declined':
				return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
			case 'withdrawn':
				return 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400';
			default:
				return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
		}
	}
</script>

<svelte:head>
	<title>Preferences — {exp.name}</title>
</svelte:head>

<a
	href={`/experiments/${exp.id}`}
	class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>← {exp.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Preferences</h1>
<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
	Standing availability queue. Assign pending preferences to concrete sessions, or decline if
	nothing fits.
</p>

<ExperimentNav />

{#if form?.assigned}
	<Alert variant="success">Assigned to {form.created} session{form.created === 1 ? '' : 's'}.</Alert
	>
{/if}
{#if form?.declined}
	<Alert variant="success">Preference declined.</Alert>
{/if}
{#if form?.error}
	<Alert variant="error">{form.error}</Alert>
{/if}

<section class="mt-6 space-y-4">
	{#each preferences as p (p.id)}
		<Card class="p-4">
			<div class="flex items-start justify-between gap-4">
				<div>
					<div class="flex items-center gap-2">
						<span class="font-medium">{p.snapshotName}</span>
						<span
							class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadge(p.status)}`}
							>{p.status}</span
						>
						<span class="text-xs text-gray-500 dark:text-gray-400">{p.kind}</span>
					</div>
					<p class="font-mono text-xs text-gray-500 dark:text-gray-400">{p.snapshotEmail}</p>
					<p class="text-xs text-gray-400 dark:text-gray-500">submitted {p.createdAtLabel}</p>
				</div>
			</div>

			{#if p.kind === 'recurring'}
				<p class="mt-3 text-sm text-gray-700 dark:text-gray-300">
					{p.rrule ?? ''} starting {p.dtstartLocal} · {p.durationMinutes} min
				</p>
			{/if}
			{#if p.notes}
				<p
					class="mt-2 rounded bg-gray-50 p-2 text-xs whitespace-pre-line text-gray-700 dark:bg-gray-800 dark:text-gray-300"
				>
					{p.notes}
				</p>
			{/if}

			{#if p.status === 'pending'}
				{#if p.matches.length === 0}
					<p class="mt-4 text-sm text-gray-500 dark:text-gray-400">
						No matching sessions available in the window. You can still decline.
					</p>
				{:else}
					<form method="post" action="?/assign" use:enhance class="mt-4 space-y-2">
						<input type="hidden" name="preferenceId" value={p.id} />
						<p class="text-xs font-medium text-gray-600 uppercase dark:text-gray-400">
							Matching sessions
						</p>
						{#each p.matches as m (m.id)}
							<label class="flex items-center gap-2 text-sm">
								<input type="checkbox" name="sessionIds" value={m.id} class="h-4 w-4" />
								<span>{m.startsAtLabel}</span>
								<span class="font-mono text-xs text-gray-400 dark:text-gray-500"
									>cap {m.capacity}</span
								>
							</label>
						{/each}
						<div class="mt-3 flex gap-2">
							<button
								type="submit"
								class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
								>Assign selected</button
							>
						</div>
					</form>
				{/if}
				<form method="post" action="?/decline" use:enhance class="mt-3">
					<input type="hidden" name="preferenceId" value={p.id} />
					<button
						type="submit"
						class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
						>Decline</button
					>
				</form>
			{/if}
		</Card>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">No preferences yet.</p>
	{/each}
</section>
