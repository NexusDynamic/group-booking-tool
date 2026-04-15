<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import { resolve } from '$app/paths';
	import { inputClass } from '$lib/styles';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let exp = $derived(data.experiment);
</script>

<svelte:head>
	<title>{exp.name} — Group Booking</title>
</svelte:head>

<div class="flex items-center justify-between">
	<div>
		<a
			href={resolve('/experiments')}
			class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
			>← Experiments</a
		>
		<h1 class="mt-1 text-2xl font-semibold">{exp.name}</h1>
		<div class="mt-1 font-mono text-xs text-gray-500 dark:text-gray-400">/e/{exp.slug}</div>
	</div>
	<div class="flex items-center gap-2">
		{#if exp.isPublished}
			<form method="post" action="?/unpublish" use:enhance>
				<button
					class="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
					>Unpublish</button
				>
			</form>
		{:else}
			<form method="post" action="?/publish" use:enhance>
				<button
					class="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
					>Publish</button
				>
			</form>
		{/if}
	</div>
</div>

<ExperimentNav />

{#if form?.saved}
	<Alert variant="success">Saved.</Alert>
{/if}

<form
	method="post"
	action="?/update"
	use:enhance={() =>
		async ({ update }) =>
			update({ reset: false })}
	class="mt-6 grid gap-4 sm:grid-cols-2"
>
	<FormField label="Name" class="sm:col-span-2">
		<input name="name" required value={form?.values?.name ?? exp.name} class={inputClass} />
	</FormField>
	<FormField label="Contact name" error={form?.errors?.experimenterName}>
		<input
			name="experimenterName"
			required
			value={form?.values?.experimenterName ?? exp.experimenterName}
			class={inputClass}
		/>
	</FormField>
	<FormField label="Contact email" error={form?.errors?.experimenterEmail}>
		<input
			type="email"
			name="experimenterEmail"
			required
			value={form?.values?.experimenterEmail ?? exp.experimenterEmail}
			class={inputClass}
		/>
	</FormField>
	<FormField label="Slug" error={form?.errors?.slug}>
		<input
			name="slug"
			required
			value={form?.values?.slug ?? exp.slug}
			class="{inputClass} font-mono text-sm"
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
	<FormField label="Max participants">
		<input
			type="number"
			name="maxParticipants"
			min="1"
			required
			value={form?.values?.maxParticipants ?? exp.maxParticipants}
			class={inputClass}
		/>
	</FormField>
	<FormField label="Default Location for sessions">
		<textarea name="location" rows="3" class={inputClass}
			>{form?.values?.location ?? exp.location}</textarea
		>
	</FormField>
	<FormField label="Default notes to show participants">
		<textarea name="notes" rows="3" class={inputClass}>{form?.values?.notes ?? exp.notes}</textarea>
	</FormField>
	<FormField label="Description" class="sm:col-span-2">
		<textarea name="description" rows="4" class={inputClass}
			>{form?.values?.description ?? exp.description}</textarea
		>
	</FormField>
	<FormField label="Inclusion criteria">
		<textarea name="inclusionCriteria" rows="4" class={inputClass}
			>{form?.values?.inclusionCriteria ?? exp.inclusionCriteria}</textarea
		>
	</FormField>
	<FormField label="Exclusion criteria">
		<textarea name="exclusionCriteria" rows="4" class={inputClass}
			>{form?.values?.exclusionCriteria ?? exp.exclusionCriteria}</textarea
		>
	</FormField>
	<label class="flex items-center gap-2 sm:col-span-2">
		<input
			type="checkbox"
			name="excludePriorAttendees"
			checked={form?.values
				? form.values.excludePriorAttendees === 'on'
				: exp.excludePriorAttendees}
			class="h-4 w-4"
		/>
		<span class="text-sm text-gray-700 dark:text-gray-300"
			>Exclude participants who already attended this experiment from signup</span
		>
	</label>

	<div class="border-t border-gray-200 pt-4 sm:col-span-2 dark:border-gray-700">
		<h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">GDPR / Privacy</h3>
		<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
			Participant data is automatically anonymised after the retention window. A privacy notice is
			shown to participants on all booking forms.
		</p>
	</div>

	<FormField label="Experiment end date" error={form?.errors?.endDate}>
		<input
			type="date"
			name="endDate"
			value={form?.values?.endDate ??
				(exp.endDate ? new Date(exp.endDate).toISOString().slice(0, 10) : '')}
			class={inputClass}
		/>
		<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
			Required for automated data retention. Participant data will be anonymised
			{data.defaultRetentionDays} days after this date (or per the override below).
			{#if form?.values?.endDate ?? (exp.endDate ? new Date(exp.endDate)
							.toISOString()
							.slice(0, 10) : '')}
				{@const endVal = form?.values?.endDate ?? new Date(exp.endDate!).toISOString().slice(0, 10)}
				{@const deletionDate = new Date(
					new Date(endVal).getTime() +
						(exp.dataRetentionDays ?? data.defaultRetentionDays) * 86_400_000
				)}
				Deletion on or after: <strong>{deletionDate.toISOString().slice(0, 10)}</strong>.
			{/if}
		</p>
	</FormField>

	<FormField
		label="Data retention (days)"
		hint="Leave blank to use the server default ({data.defaultRetentionDays} days)."
		error={form?.errors?.dataRetentionDays}
	>
		<input
			type="number"
			name="dataRetentionDays"
			min="1"
			max="3650"
			placeholder={String(data.defaultRetentionDays)}
			value={form?.values?.dataRetentionDays ?? exp.dataRetentionDays ?? ''}
			class={inputClass}
		/>
	</FormField>

	<FormField label="Privacy notice URL" hint="Optional link to your full privacy policy.">
		<input
			type="url"
			name="privacyNoticeUrl"
			placeholder="https://example.com/privacy"
			value={form?.values?.privacyNoticeUrl ?? exp.privacyNoticeUrl}
			class={inputClass}
		/>
	</FormField>

	<FormField
		label="Privacy notice text"
		hint="Leave blank to show an auto-generated notice based on the retention window."
		class="sm:col-span-2"
	>
		<textarea
			name="privacyNoticeText"
			rows="3"
			placeholder="Your name and email are used only to manage your booking…"
			class={inputClass}>{form?.values?.privacyNoticeText ?? exp.privacyNoticeText}</textarea
		>
	</FormField>

	<div class="flex items-center justify-between sm:col-span-2">
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
			>Save changes</button
		>
	</div>
</form>

<section
	class="mt-12 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
>
	<h3 class="text-sm font-semibold text-red-800 dark:text-red-300">Danger zone</h3>
	<p class="mt-1 text-xs text-red-700 dark:text-red-400">
		Deleting an experiment removes its sessions and templates. Bookings must be cancelled first.
	</p>
	{#if form?.deleteError}
		<p class="mt-2 text-sm text-red-700 dark:text-red-400">{form.deleteError}</p>
	{/if}
	<form
		method="post"
		action="?/delete"
		use:enhance
		onsubmit={(e) => {
			if (!confirm('Delete this experiment? This cannot be undone.')) e.preventDefault();
		}}
		class="mt-3"
	>
		<button
			type="submit"
			class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
			>Delete experiment</button
		>
	</form>
</section>
