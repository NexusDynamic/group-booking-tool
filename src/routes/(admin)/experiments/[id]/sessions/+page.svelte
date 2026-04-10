<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

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
				return 'bg-blue-100 text-blue-800';
			case 'below-min':
				return 'bg-amber-100 text-amber-800';
			case 'cancelled':
				return 'bg-gray-200 text-gray-700';
			default:
				return 'bg-green-100 text-green-800';
		}
	}
</script>

<svelte:head>
	<title>Sessions — {exp.name}</title>
</svelte:head>

<a href={`/experiments/${exp.id}`} class="text-sm text-gray-500 hover:text-gray-900"
	>← {exp.name}</a
>
<div class="mt-1 flex items-center justify-between">
	<h1 class="text-2xl font-semibold">Sessions</h1>
	<div class="flex items-center gap-3 text-sm">
		{#if data.upcomingOnly}
			<a href="?all=1" class="text-gray-500 hover:text-gray-900">Show all</a>
		{:else}
			<a href="./sessions" class="text-gray-500 hover:text-gray-900">Upcoming only</a>
		{/if}
		<button
			type="button"
			onclick={() => (showNewForm = !showNewForm)}
			class="rounded-md bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-800"
			>{showNewForm ? 'Cancel' : 'Add one-off'}</button
		>
	</div>
</div>

<nav class="mt-6 flex gap-4 border-b border-gray-200 text-sm">
	<a href={`/experiments/${exp.id}`} class="pb-2 text-gray-500 hover:text-gray-900">Settings</a>
	<a href={`/experiments/${exp.id}/fields`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Required fields</a
	>
	<a href={`/experiments/${exp.id}/templates`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Recurrence templates</a
	>
	<span class="border-b-2 border-gray-900 pb-2 font-medium">Sessions</span>
</nav>

{#if form?.created}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Session created.</p>
{/if}
{#if form?.cancelled}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Session cancelled.</p>
{/if}
{#if form?.deleted}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Session deleted.</p>
{/if}

{#if showNewForm}
	<form
		method="post"
		action="?/create"
		use:enhance
		class="mt-6 grid gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2"
	>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Start (local)</span>
			<input
				type="datetime-local"
				name="startsAtLocal"
				required
				value={form?.values?.startsAtLocal ?? ''}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
			{#if form?.errors?.startsAtLocal}
				<p class="mt-1 text-sm text-red-600">{form.errors.startsAtLocal}</p>
			{/if}
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Duration (minutes)</span>
			<input
				type="number"
				name="durationMinutes"
				min="1"
				required
				value={form?.values?.durationMinutes ?? exp.durationMinutes}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Capacity</span>
			<input
				type="number"
				name="capacity"
				min="1"
				required
				value={form?.values?.capacity ?? exp.maxParticipants}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Min participants</span>
			<input
				type="number"
				name="minParticipants"
				min="1"
				required
				value={form?.values?.minParticipants ?? exp.minParticipants}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="sm:col-span-2 block">
			<span class="text-sm font-medium text-gray-700">Location</span>
			<input
				name="location"
				value={form?.values?.location ?? ''}
				placeholder="Room B-305"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="sm:col-span-2 block">
			<span class="text-sm font-medium text-gray-700">Notes</span>
			<textarea
				name="notes"
				rows="2"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
				>{form?.values?.notes ?? ''}</textarea
			>
		</label>
		<div class="sm:col-span-2">
			<button
				type="submit"
				class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
				>Create session</button
			>
		</div>
	</form>
{/if}

<div class="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
	<table class="w-full text-sm">
		<thead class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase">
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
				<tr class="border-t border-gray-100">
					<td class="px-4 py-3">
						<a
							href={`/experiments/${exp.id}/sessions/${s.id}`}
							class="font-medium text-gray-900 hover:underline">{s.startsAtLabel}</a
						>
						<div class="text-xs text-gray-500">until {s.endsAtLabel}</div>
					</td>
					<td class="px-4 py-3 font-mono">{s.confirmedCount}/{s.capacity}</td>
					<td class="px-4 py-3">
						<span class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${badgeClass(label)}`}
							>{label}</span
						>
					</td>
					<td class="px-4 py-3 text-xs text-gray-500">
						{s.sourceTemplateId ? 'template' : 'one-off'}
					</td>
					<td class="px-4 py-3 text-right">
						{#if s.status !== 'cancelled'}
							<form method="post" action="?/cancel" use:enhance class="inline">
								<input type="hidden" name="id" value={s.id} />
								<button class="text-xs text-amber-700 hover:text-amber-900">Cancel</button>
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
								<button class="text-xs text-red-600 hover:text-red-800">Delete</button>
							</form>
						{/if}
					</td>
				</tr>
			{:else}
				<tr>
					<td colspan="5" class="px-4 py-8 text-center text-sm text-gray-500">
						No sessions yet. Generate some from a template or add a one-off above.
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
