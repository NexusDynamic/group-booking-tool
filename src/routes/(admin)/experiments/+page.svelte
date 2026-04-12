<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showNew = $state(false);
</script>

<svelte:head>
	<title>Experiments — Group Booking</title>
</svelte:head>

<div class="flex items-center justify-between">
	<h1 class="text-2xl font-semibold">Experiments</h1>
	<button
		type="button"
		onclick={() => (showNew = !showNew)}
		class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
	>
		{showNew ? 'Cancel' : 'New experiment'}
	</button>
</div>

{#if showNew}
	<section
		class="mt-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900"
	>
		<h2 class="text-lg font-medium">New experiment</h2>
		<form method="post" action="?/create" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
			<label class="block sm:col-span-2">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Name</span>
				<input
					name="name"
					required
					value={form?.values?.name ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
				{#if form?.errors?.name}
					<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.name}</p>
				{/if}
			</label>
			<label class="block sm:col-span-2">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Display name for experimenter</span
				>
				<input
					name="experimenterName"
					required
					value={form?.values?.experimenterName ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
				{#if form?.errors?.experimenterName}
					<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.experimenterName}</p>
				{/if}
			</label>
			<label class="block sm:col-span-2">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Contact email for experimenter</span
				>
				<input
					type="email"
					name="experimenterEmail"
					required
					value={form?.values?.experimenterEmail ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
				{#if form?.errors?.experimenterEmail}
					<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.experimenterEmail}</p>
				{/if}
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Slug (public URL)</span>
				<input
					name="slug"
					placeholder="auto-generated from name"
					value={form?.values?.slug ?? ''}
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
					value={form?.values?.durationMinutes ?? '60'}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Default Location for sessions</span
				>
				<input
					name="location"
					value={form?.values?.location ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Min participants per session</span
				>
				<input
					type="number"
					name="minParticipants"
					min="1"
					required
					value={form?.values?.minParticipants ?? '1'}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Max participants per session</span
				>
				<input
					type="number"
					name="maxParticipants"
					min="1"
					required
					value={form?.values?.maxParticipants ?? '4'}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
			<label class="block sm:col-span-2">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Description</span>
				<textarea
					name="description"
					rows="3"
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					>{form?.values?.description ?? ''}</textarea
				>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Inclusion criteria</span>
				<textarea
					name="inclusionCriteria"
					rows="3"
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					>{form?.values?.inclusionCriteria ?? ''}</textarea
				>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Exclusion criteria</span>
				<textarea
					name="exclusionCriteria"
					rows="3"
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
					>{form?.values?.exclusionCriteria ?? ''}</textarea
				>
			</label>
			<label class="flex items-center gap-2 sm:col-span-2">
				<input
					type="checkbox"
					name="excludePriorAttendees"
					checked={form?.values?.excludePriorAttendees !== 'off'}
					class="h-4 w-4"
				/>
				<span class="text-sm text-gray-700 dark:text-gray-300"
					>Exclude participants who already attended this experiment from signup</span
				>
			</label>
			<div class="sm:col-span-2">
				<button
					type="submit"
					class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
					>Create</button
				>
			</div>
		</form>
	</section>
{/if}

<section class="mt-6">
	{#if data.experiments.length === 0}
		<p
			class="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-500 dark:border-gray-600 dark:text-gray-400"
		>
			No experiments yet. Click <strong>New experiment</strong> to get started.
		</p>
	{:else}
		<ul class="space-y-2">
			{#each data.experiments as exp (exp.id)}
				<li>
					<a
						href={resolve(`/experiments/${exp.id}`)}
						class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-500"
					>
						<div>
							<div class="font-medium">{exp.name}</div>
							<div class="font-mono text-xs text-gray-500 dark:text-gray-400">/e/{exp.slug}</div>
						</div>
						<div class="flex items-center gap-2">
							{#if exp.isPublished}
								<span
									class="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-300"
									>Published</span
								>
							{:else}
								<span
									class="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
									>Draft</span
								>
							{/if}
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
