<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let exp = $derived(data.experiment);
	let rules = $derived(data.rules);

	function offsetLabel(mins: number) {
		if (mins < 60) return `${mins} min before`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)} h before`;
		return `${Math.round(mins / 60 / 24)} d before`;
	}

	function conditionLabel(c: string) {
		switch (c) {
			case 'always':
				return 'always';
			case 'below_minimum':
				return 'only if below minimum';
			case 'at_capacity':
				return 'only if at capacity';
			default:
				return c;
		}
	}
</script>

<svelte:head>
	<title>Reminder rules — {exp.name}</title>
</svelte:head>

<a href={`/experiments/${exp.id}`} class="text-sm text-gray-500 hover:text-gray-900"
	>← {exp.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Reminder rules</h1>
<p class="mt-2 text-sm text-gray-600">
	These rules generate extra events in the researcher ICS feed. Use them to remind yourself to
	email participants, consider cancelling, or whatever the condition demands.
</p>

<nav class="mt-6 flex gap-4 border-b border-gray-200 text-sm">
	<a href={`/experiments/${exp.id}`} class="pb-2 text-gray-500 hover:text-gray-900">Settings</a>
	<a href={`/experiments/${exp.id}/sessions`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Sessions</a
	>
	<a href={`/experiments/${exp.id}/preferences`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Preferences</a
	>
	<span class="border-b-2 border-gray-900 pb-2 font-medium">Reminders</span>
	<a href={`/experiments/${exp.id}/ics`} class="pb-2 text-gray-500 hover:text-gray-900">ICS</a>
</nav>

{#if form?.created}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Rule added.</p>
{/if}
{#if form?.deleted}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Rule deleted.</p>
{/if}

<section class="mt-6 space-y-2">
	{#each rules as r (r.id)}
		<article
			class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4"
		>
			<div>
				<div class="font-medium">{r.label}</div>
				<div class="text-xs text-gray-500">
					{offsetLabel(r.offsetMinutesBefore)} · {conditionLabel(r.condition)} · {r.durationMinutes}
					min event
				</div>
			</div>
			<form method="post" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={r.id} />
				<button class="text-sm text-red-600 hover:text-red-800">Delete</button>
			</form>
		</article>
	{:else}
		<p class="text-sm text-gray-500">No rules yet.</p>
	{/each}
</section>

<h2 class="mt-10 text-lg font-semibold">New rule</h2>
<form method="post" action="?/create" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
	<label class="sm:col-span-2 block">
		<span class="text-sm font-medium text-gray-700">Label</span>
		<input
			name="label"
			required
			value={form?.values?.label ?? ''}
			placeholder="Email participants instructions"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
		{#if form?.errors?.label}<p class="mt-1 text-sm text-red-600">{form.errors.label}</p>{/if}
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700">Minutes before session</span>
		<input
			type="number"
			name="offsetMinutesBefore"
			min="0"
			required
			value={form?.values?.offsetMinutesBefore ?? 1440}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700">Condition</span>
		<select
			name="condition"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		>
			<option value="always">always</option>
			<option value="below_minimum">only if below minimum</option>
			<option value="at_capacity">only if at capacity</option>
		</select>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700">Event duration (minutes)</span>
		<input
			type="number"
			name="durationMinutes"
			min="1"
			required
			value={form?.values?.durationMinutes ?? 15}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
		/>
	</label>
	<div class="sm:col-span-2">
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
			>Add rule</button
		>
	</div>
</form>
