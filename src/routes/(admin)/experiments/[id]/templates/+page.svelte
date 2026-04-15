<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import Card from '$lib/components/Card.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import { resolve } from '$app/paths';
	import { inputClass } from '$lib/styles';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let exp = $derived(data.experiment);
	let templates = $derived(data.templates);

	function formatWindow(startLabel: string | null, endLabel: string | null) {
		if (!startLabel && !endLabel) return 'open-ended';
		return `${startLabel ?? '…'} → ${endLabel ?? '…'}`;
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

<a
	href={resolve(`/experiments/${exp.id}`)}
	class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>← {exp.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Recurrence templates</h1>
<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
	Define a weekly recurring slot, then click <em>Generate</em> to materialise it into concrete sessions.
	Regenerating only touches future sessions with zero bookings.
</p>

<ExperimentNav />

{#if form?.created}
	<Alert variant="success">Template created.</Alert>
{/if}
{#if form?.generated}
	<Alert variant="success"
		>Generated {form.inserted} new session{form.inserted === 1 ? '' : 's'}.</Alert
	>
{/if}
{#if form?.regenerated}
	<Alert variant="success">Regenerated: {form.deleted} removed, {form.inserted} inserted.</Alert>
{/if}
{#if form?.deleted}
	<Alert variant="success">Template deleted.</Alert>
{/if}

<section class="mt-6 space-y-3">
	{#each templates as t (t.id)}
		<Card class="p-4">
			<div class="flex items-start justify-between gap-4">
				<div>
					<h3 class="font-medium">{t.label}</h3>
					<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
						{prettyRrule(t.rrule)} at {t.dtstartLocal.slice(11, 16)}, {t.durationMinutes} min
					</p>
					<p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
						Capacity {t.capacity} (min {t.minParticipants}) · window {formatWindow(
							t.windowStartLabel,
							t.windowEndLabel
						)}
					</p>
				</div>
				<div class="flex flex-shrink-0 flex-wrap justify-end gap-2">
					<form method="post" action="?/generate" use:enhance>
						<input type="hidden" name="id" value={t.id} />
						<button
							class="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
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
							class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
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
							class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
							>Delete</button
						>
					</form>
				</div>
			</div>
		</Card>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">No templates yet. Create one below.</p>
	{/each}
</section>

<h2 class="mt-10 text-lg font-semibold">New template</h2>
<form method="post" action="?/create" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
	<FormField label="Label" error={form?.errors?.label} class="sm:col-span-2">
		<input
			name="label"
			required
			value={form?.values?.label ?? ''}
			placeholder="Mon 09:00 block"
			class={inputClass}
		/>
	</FormField>

	<FormField
		label="Weekdays (BYDAY)"
		error={form?.errors?.byDay}
		hint="Comma-separated: MO, TU, WE, TH, FR, SA, SU"
	>
		<input
			name="byDay"
			required
			value={form?.values?.byDay ?? 'MO'}
			placeholder="MO,WE,FR"
			class="{inputClass} font-mono text-sm uppercase"
		/>
	</FormField>

	<FormField
		label="Session time"
		error={form?.errors?.timeLocal}
		hint="Wall-clock start time for each session"
	>
		<input
			type="time"
			name="timeLocal"
			required
			value={form?.values?.timeLocal ?? ''}
			class={inputClass}
		/>
	</FormField>

	<FormField label="Duration (minutes)">
		<input
			type="number"
			name="durationMinutes"
			min="1"
			required
			value={form?.values?.durationMinutes ?? exp.durationMinutes}
			class={inputClass}
		/>
	</FormField>

	<FormField label="Capacity">
		<input
			type="number"
			name="capacity"
			min="1"
			required
			value={form?.values?.capacity ?? exp.maxParticipants}
			class={inputClass}
		/>
	</FormField>

	<FormField label="Min participants">
		<input
			type="number"
			name="minParticipants"
			min="1"
			required
			value={form?.values?.minParticipants ?? exp.minParticipants}
			class={inputClass}
		/>
	</FormField>

	<FormField label="First session date (optional)" hint="Leave blank to generate from today">
		<input
			type="date"
			name="windowStart"
			value={form?.values?.windowStart ?? ''}
			class={inputClass}
		/>
	</FormField>

	<FormField label="Last session date (optional)" hint="Leave blank to generate 1 year of sessions">
		<input type="date" name="windowEnd" value={form?.values?.windowEnd ?? ''} class={inputClass} />
	</FormField>

	<FormField label="Default Session Location (optional)" class="sm:col-span-2">
		<textarea name="location" rows="3" class={inputClass}
			>{form?.values?.location ?? exp.location}</textarea
		>
	</FormField>

	<FormField label="Default Session Notes for participants (optional)" class="sm:col-span-2">
		<textarea name="notes" rows="3" class={inputClass}>{form?.values?.notes ?? exp.notes}</textarea>
	</FormField>

	<div class="sm:col-span-2">
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
			>Create template</button
		>
	</div>
</form>
