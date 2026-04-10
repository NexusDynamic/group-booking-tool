<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let exp = $derived(data.experiment);
</script>

<svelte:head>
	<title>{exp.name} — Group Booking</title>
</svelte:head>

<div class="flex items-center justify-between">
	<div>
		<a href="/experiments" class="text-sm text-gray-500 hover:text-gray-900">← Experiments</a>
		<h1 class="mt-1 text-2xl font-semibold">{exp.name}</h1>
		<div class="mt-1 font-mono text-xs text-gray-500">/e/{exp.slug}</div>
	</div>
	<div class="flex items-center gap-2">
		{#if exp.isPublished}
			<form method="post" action="?/unpublish" use:enhance>
				<button class="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
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

<nav class="mt-6 flex gap-4 border-b border-gray-200 text-sm">
	<span class="border-b-2 border-gray-900 pb-2 font-medium">Settings</span>
	<a href={`/experiments/${exp.id}/fields`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Required fields</a
	>
	<a href={`/experiments/${exp.id}/templates`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Recurrence templates</a
	>
	<a href={`/experiments/${exp.id}/sessions`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Sessions</a
	>
	<a href={`/experiments/${exp.id}/preferences`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Preferences</a
	>
	<a href={`/experiments/${exp.id}/reminders`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Reminders</a
	>
	<a href={`/experiments/${exp.id}/ics`} class="pb-2 text-gray-500 hover:text-gray-900">ICS</a>
</nav>

{#if form?.saved}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Saved.</p>
{/if}

<form method="post" action="?/update" use:enhance class="mt-6 grid gap-4 sm:grid-cols-2">
	<label class="sm:col-span-2 block">
		<span class="text-sm font-medium text-gray-700">Name</span>
		<input
			name="name"
			required
			value={form?.values?.name ?? exp.name}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700">Slug</span>
		<input
			name="slug"
			required
			value={form?.values?.slug ?? exp.slug}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
		/>
		{#if form?.errors?.slug}<p class="mt-1 text-sm text-red-600">{form.errors.slug}</p>{/if}
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
		<span class="text-sm font-medium text-gray-700">Max participants</span>
		<input
			type="number"
			name="maxParticipants"
			min="1"
			required
			value={form?.values?.maxParticipants ?? exp.maxParticipants}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
	</label>
	<label class="sm:col-span-2 block">
		<span class="text-sm font-medium text-gray-700">Description</span>
		<textarea name="description" rows="4" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			>{form?.values?.description ?? exp.description}</textarea
		>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700">Inclusion criteria</span>
		<textarea
			name="inclusionCriteria"
			rows="4"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			>{form?.values?.inclusionCriteria ?? exp.inclusionCriteria}</textarea
		>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700">Exclusion criteria</span>
		<textarea
			name="exclusionCriteria"
			rows="4"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			>{form?.values?.exclusionCriteria ?? exp.exclusionCriteria}</textarea
		>
	</label>
	<label class="sm:col-span-2 flex items-center gap-2">
		<input
			type="checkbox"
			name="excludePriorAttendees"
			checked={form?.values
				? form.values.excludePriorAttendees === 'on'
				: exp.excludePriorAttendees}
			class="h-4 w-4"
		/>
		<span class="text-sm text-gray-700"
			>Exclude participants who already attended this experiment from signup</span
		>
	</label>
	<div class="sm:col-span-2 flex items-center justify-between">
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
			>Save changes</button
		>
	</div>
</form>

<section class="mt-12 rounded-lg border border-red-200 bg-red-50 p-4">
	<h3 class="text-sm font-semibold text-red-800">Danger zone</h3>
	<p class="mt-1 text-xs text-red-700">
		Deleting an experiment removes its sessions and templates. Bookings must be cancelled first.
	</p>
	{#if form?.deleteError}
		<p class="mt-2 text-sm text-red-700">{form.deleteError}</p>
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
			class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
			>Delete experiment</button
		>
	</form>
</section>
