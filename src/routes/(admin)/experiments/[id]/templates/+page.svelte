<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let exp = $derived(data.experiment);
	let templates = $derived(data.templates);

	function formatWindow(start: Date | null, end: Date | null) {
		if (!start && !end) return 'open-ended';
		const s = start ? new Date(start).toISOString().slice(0, 10) : '…';
		const e = end ? new Date(end).toISOString().slice(0, 10) : '…';
		return `${s} → ${e}`;
	}

	function prettyRrule(rrule: string) {
		const m = rrule.match(/BYDAY=([^;]+)/);
		if (!m) return rrule;
		return `Weekly on ${m[1]}`;
	}
</script>

<svelte:head>
	<title>Recurrence templates — {exp.name}</title>
</svelte:head>

<a href={`/experiments/${exp.id}`} class="text-sm text-gray-500 hover:text-gray-900"
	>← {exp.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Recurrence templates</h1>
<p class="mt-2 text-sm text-gray-600">
	Define a weekly recurring slot, then click <em>Generate</em> to materialise it into concrete sessions.
	Regenerating only touches future sessions with zero bookings.
</p>

<nav class="mt-6 flex gap-4 border-b border-gray-200 text-sm">
	<a href={`/experiments/${exp.id}`} class="pb-2 text-gray-500 hover:text-gray-900">Settings</a>
	<a href={`/experiments/${exp.id}/fields`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Required fields</a
	>
	<span class="border-b-2 border-gray-900 pb-2 font-medium">Recurrence templates</span>
	<a href={`/experiments/${exp.id}/sessions`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Sessions</a
	>
</nav>

{#if form?.created}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Template created.</p>
{/if}
{#if form?.generated}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
		Generated {form.inserted} new session{form.inserted === 1 ? '' : 's'}.
	</p>
{/if}
{#if form?.regenerated}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">
		Regenerated: {form.deleted} removed, {form.inserted} inserted.
	</p>
{/if}
{#if form?.deleted}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Template deleted.</p>
{/if}

<section class="mt-6 space-y-3">
	{#each templates as t (t.id)}
		<article class="rounded-lg border border-gray-200 bg-white p-4">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h3 class="font-medium">{t.label}</h3>
					<p class="mt-1 text-sm text-gray-600">
						{prettyRrule(t.rrule)} at {t.dtstartLocal.slice(11, 16)}, {t.durationMinutes} min
					</p>
					<p class="mt-0.5 text-xs text-gray-500">
						Capacity {t.capacity} (min {t.minParticipants}) · window {formatWindow(
							t.windowStart,
							t.windowEnd
						)}
					</p>
				</div>
				<div class="flex flex-shrink-0 flex-wrap justify-end gap-2">
					<form method="post" action="?/generate" use:enhance>
						<input type="hidden" name="id" value={t.id} />
						<button
							class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
							>Generate</button
						>
					</form>
					<form
						method="post"
						action="?/regenerate"
						use:enhance
						onsubmit={(e) => {
							if (
								!confirm(
									'Regenerate future sessions? Zero-booking future sessions will be deleted and re-created.'
								)
							)
								e.preventDefault();
						}}
					>
						<input type="hidden" name="id" value={t.id} />
						<button
							class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
							>Regenerate</button
						>
					</form>
					<form
						method="post"
						action="?/delete"
						use:enhance
						onsubmit={(e) => {
							if (!confirm('Delete this template? Existing sessions will remain.'))
								e.preventDefault();
						}}
					>
						<input type="hidden" name="id" value={t.id} />
						<button
							class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
							>Delete</button
						>
					</form>
				</div>
			</div>
		</article>
	{:else}
		<p class="text-sm text-gray-500">No templates yet. Create one below.</p>
	{/each}
</section>

<h2 class="mt-10 text-lg font-semibold">New template</h2>
<form method="post" action="?/create" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
	<label class="sm:col-span-2 block">
		<span class="text-sm font-medium text-gray-700">Label</span>
		<input
			name="label"
			required
			value={form?.values?.label ?? ''}
			placeholder="Mon 09:00 block"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
		{#if form?.errors?.label}<p class="mt-1 text-sm text-red-600">{form.errors.label}</p>{/if}
	</label>

	<label class="block">
		<span class="text-sm font-medium text-gray-700">Weekdays (BYDAY)</span>
		<input
			name="byDay"
			required
			value={form?.values?.byDay ?? 'MO'}
			placeholder="MO,WE,FR"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm uppercase"
		/>
		<p class="mt-1 text-xs text-gray-500">Comma-separated: MO, TU, WE, TH, FR, SA, SU</p>
		{#if form?.errors?.byDay}<p class="mt-1 text-sm text-red-600">{form.errors.byDay}</p>{/if}
	</label>

	<label class="block">
		<span class="text-sm font-medium text-gray-700">Start (local)</span>
		<input
			type="datetime-local"
			name="dtstartLocal"
			required
			value={form?.values?.dtstartLocal ?? ''}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
		{#if form?.errors?.dtstartLocal}
			<p class="mt-1 text-sm text-red-600">{form.errors.dtstartLocal}</p>
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

	<label class="block">
		<span class="text-sm font-medium text-gray-700">Window start (optional)</span>
		<input
			type="date"
			name="windowStart"
			value={form?.values?.windowStart ?? ''}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
	</label>

	<label class="block">
		<span class="text-sm font-medium text-gray-700">Window end (optional)</span>
		<input
			type="date"
			name="windowEnd"
			value={form?.values?.windowEnd ?? ''}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
	</label>

	<div class="sm:col-span-2">
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
			>Create template</button
		>
	</div>
</form>
