<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import { resolve } from '$app/paths';

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

<form method="post" action="?/update" use:enhance class="mt-6 grid gap-4 sm:grid-cols-2">
	<label class="block sm:col-span-2">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Name</span>
		<input
			name="name"
			required
			value={form?.values?.name ?? exp.name}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Slug</span>
		<input
			name="experimenterName"
			required
			value={form?.values?.experimenterName ?? exp.experimenterName}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
		{#if form?.errors?.experimenterName}
			<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.experimenterName}</p>
		{/if}
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
			>Contact email for experimenter</span
		>
		<input
			type="email"
			name="experimenterEmail"
			required
			value={form?.values?.experimenterEmail ?? exp.experimenterEmail}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
		{#if form?.errors?.experimenterEmail}
			<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.experimenterEmail}</p>
		{/if}
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Slug</span>
		<input
			name="slug"
			required
			value={form?.values?.slug ?? exp.slug}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
		{#if form?.errors?.slug}
			<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.slug}</p>
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
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Max participants</span>
		<input
			type="number"
			name="maxParticipants"
			min="1"
			required
			value={form?.values?.maxParticipants ?? exp.maxParticipants}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
			>Default Location for sessions</span
		>
		<textarea
			name="location"
			rows="3"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			>{form?.values?.location ?? exp.location}</textarea
		>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
			>Default notes to show participants</span
		>
		<textarea
			name="notes"
			rows="3"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			>{form?.values?.notes ?? exp.notes}</textarea
		>
	</label>
	<label class="block sm:col-span-2">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Description</span>
		<textarea
			name="description"
			rows="4"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			>{form?.values?.description ?? exp.description}</textarea
		>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Inclusion criteria</span>
		<textarea
			name="inclusionCriteria"
			rows="4"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			>{form?.values?.inclusionCriteria ?? exp.inclusionCriteria}</textarea
		>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Exclusion criteria</span>
		<textarea
			name="exclusionCriteria"
			rows="4"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			>{form?.values?.exclusionCriteria ?? exp.exclusionCriteria}</textarea
		>
	</label>
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
