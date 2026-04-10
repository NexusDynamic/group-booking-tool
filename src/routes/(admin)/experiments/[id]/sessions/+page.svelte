<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import Card from '$lib/components/Card.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let exp = $derived(data.experiment);
	let sessions = $derived(data.sessions);

	let showNewForm = $state(false);

	function statusLabel(s: (typeof sessions)[number]) {
		if (s.status === 'cancelled') return 'cancelled';
		if (s.confirmedCount >= s.capacity) return 'full';
		if (s.confirmedCount < s.minParticipants) return 'below-min';
		return 'ok';
	}

	function badgeClass(label: string) {
		switch (label) {
			case 'full':
				return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
			case 'below-min':
				return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
			case 'cancelled':
				return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
			default:
				return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300';
		}
	}
</script>

<svelte:head>
	<title>Sessions — {exp.name}</title>
</svelte:head>

<a
	href={`/experiments/${exp.id}`}
	class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>← {exp.name}</a
>
<div class="mt-1 flex items-center justify-between">
	<h1 class="text-2xl font-semibold">Sessions</h1>
	<div class="flex items-center gap-3 text-sm">
		{#if data.upcomingOnly}
			<a
				href="?all=1"
				class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
				>Show all</a
			>
		{:else}
			<a
				href="./sessions"
				class="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
				>Upcoming only</a
			>
		{/if}
		<button
			type="button"
			onclick={() => (showNewForm = !showNewForm)}
			class="rounded-md bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
			>{showNewForm ? 'Cancel' : 'Add one-off'}</button
		>
	</div>
</div>

<ExperimentNav />

{#if form?.created}
	<Alert variant="success">Session created.</Alert>
{/if}
{#if form?.cancelled}
	<Alert variant="success">Session cancelled.</Alert>
{/if}
{#if form?.deleted}
	<Alert variant="success">Session deleted.</Alert>
{/if}

{#if showNewForm}
	<Card class="mt-6 p-4">
	<form
		method="post"
		action="?/create"
		use:enhance
		class="grid gap-4 sm:grid-cols-2"
	>
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Start (local)</span>
			<input
				type="datetime-local"
				name="startsAtLocal"
				required
				value={form?.values?.startsAtLocal ?? ''}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			{#if form?.errors?.startsAtLocal}
				<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.startsAtLocal}</p>
			{/if}
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Duration (minutes)</span>
			<input
				type="number"
				name="durationMinutes"
				min="1"
				required
				value={form?.values?.durationMinutes ?? exp.durationMinutes}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Capacity</span>
			<input
				type="number"
				name="capacity"
				min="1"
				required
				value={form?.values?.capacity ?? exp.maxParticipants}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Min participants</span>
			<input
				type="number"
				name="minParticipants"
				min="1"
				required
				value={form?.values?.minParticipants ?? exp.minParticipants}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="sm:col-span-2 block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Location</span>
			<input
				name="location"
				value={form?.values?.location ?? ''}
				placeholder="Room B-305"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="sm:col-span-2 block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</span>
			<textarea
				name="notes"
				rows="2"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				>{form?.values?.notes ?? ''}</textarea
			>
		</label>
		<div class="sm:col-span-2">
			<button
				type="submit"
				class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
				>Create session</button
			>
		</div>
	</form>
	</Card>
{/if}

<Card class="mt-6 overflow-hidden">
	<table class="w-full text-sm">
		<thead
			class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase dark:bg-gray-800 dark:text-gray-400"
		>
			<tr>
				<th class="px-4 py-3">When</th>
				<th class="px-4 py-3">Booked</th>
				<th class="px-4 py-3">Status</th>
				<th class="px-4 py-3">Source</th>
				<th class="px-4 py-3"></th>
			</tr>
		</thead>
		<tbody>
			{#each sessions as s (s.id)}
				{@const label = statusLabel(s)}
				<tr class="border-t border-gray-100 dark:border-gray-800">
					<td class="px-4 py-3">
						<a
							href={`/experiments/${exp.id}/sessions/${s.id}`}
							class="font-medium text-gray-900 hover:underline dark:text-gray-100">{s.startsAtLabel}</a
						>
						<div class="text-xs text-gray-500 dark:text-gray-400">until {s.endsAtLabel}</div>
					</td>
					<td class="px-4 py-3 font-mono">{s.confirmedCount}/{s.capacity}</td>
					<td class="px-4 py-3">
						<span class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badgeClass(label)}`}
							>{label}</span
						>
					</td>
					<td class="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
						{s.sourceTemplateId ? 'template' : 'one-off'}
					</td>
					<td class="px-4 py-3 text-right">
						{#if s.status !== 'cancelled'}
							<form method="post" action="?/cancel" use:enhance class="inline">
								<input type="hidden" name="id" value={s.id} />
								<button
									class="text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
									>Cancel</button
								>
							</form>
						{/if}
						{#if s.confirmedCount === 0}
							<form
								method="post"
								action="?/delete"
								use:enhance
								class="ml-2 inline"
								onsubmit={(e) => {
									if (!confirm('Delete this session?')) e.preventDefault();
								}}
							>
								<input type="hidden" name="id" value={s.id} />
								<button
									class="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
									>Delete</button
								>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
						No sessions yet. Generate some from a template or add a one-off above.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</Card>
