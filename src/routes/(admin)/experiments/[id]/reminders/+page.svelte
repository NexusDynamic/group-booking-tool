<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import Card from '$lib/components/Card.svelte';
	import { resolve } from '$app/paths';

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

<a
	href={resolve(`/experiments/${exp.id}`)}
	class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>← {exp.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Reminder rules</h1>
<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
	These rules generate extra events in the researcher ICS feed. Use them to remind yourself to email
	participants, consider cancelling, or whatever the condition demands.
</p>

<ExperimentNav />

{#if form?.created}
	<Alert variant="success">Rule added.</Alert>
{/if}
{#if form?.deleted}
	<Alert variant="success">Rule deleted.</Alert>
{/if}

<section class="mt-6 space-y-2">
	{#each rules as r (r.id)}
		<Card class="flex items-center justify-between p-4">
			<div>
				<div class="font-medium">{r.label}</div>
				<div class="text-xs text-gray-500 dark:text-gray-400">
					{offsetLabel(r.offsetMinutesBefore)} · {conditionLabel(r.condition)} · {r.durationMinutes}
					min event
				</div>
			</div>
			<form method="post" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={r.id} />
				<button
					class="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
					>Delete</button
				>
			</form>
		</Card>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">No rules yet.</p>
	{/each}
</section>

<h2 class="mt-10 text-lg font-semibold">New rule</h2>
<form method="post" action="?/create" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
	<label class="block sm:col-span-2">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Label</span>
		<input
			name="label"
			required
			value={form?.values?.label ?? ''}
			placeholder="Email participants instructions"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
		{#if form?.errors?.label}
			<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.label}</p>
		{/if}
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Minutes before session</span>
		<input
			type="number"
			name="offsetMinutesBefore"
			min="0"
			required
			value={form?.values?.offsetMinutesBefore ?? 1440}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Condition</span>
		<select
			name="condition"
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		>
			<option value="always">always</option>
			<option value="below_minimum">only if below minimum</option>
			<option value="at_capacity">only if at capacity</option>
		</select>
	</label>
	<label class="block">
		<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
			>Event duration (minutes)</span
		>
		<input
			type="number"
			name="durationMinutes"
			min="1"
			required
			value={form?.values?.durationMinutes ?? 15}
			class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
		/>
	</label>
	<div class="sm:col-span-2">
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
			>Add rule</button
		>
	</div>
</form>
