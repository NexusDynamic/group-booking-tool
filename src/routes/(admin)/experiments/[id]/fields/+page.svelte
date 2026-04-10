<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import type { RequiredField } from '$lib/schemas/experiment';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type FieldType = 'text' | 'email' | 'number' | 'checkbox';

	// Local working copy — initialised once from the server load (untrack avoids
	// the Svelte 5 warning about capturing prop state in a $state initializer).
	let fields = $state<RequiredField[]>(
		untrack(() => (form?.fields as RequiredField[] | undefined) ?? data.fields)
	);

	function addField() {
		fields = [
			...fields,
			{ key: '', label: '', type: 'text' as FieldType, required: false }
		];
	}

	function removeField(i: number) {
		fields = fields.filter((_, idx) => idx !== i);
	}
</script>

<svelte:head>
	<title>Required fields — {data.experiment.name}</title>
</svelte:head>

<a href={`/experiments/${data.experiment.id}`} class="text-sm text-gray-500 hover:text-gray-900"
	>← {data.experiment.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Required participant fields</h1>
<p class="mt-2 text-sm text-gray-600">
	These fields appear on the public signup form. Name and email are always collected.
</p>

<nav class="mt-6 flex gap-4 border-b border-gray-200 text-sm">
	<a href={`/experiments/${data.experiment.id}`} class="pb-2 text-gray-500 hover:text-gray-900"
		>Settings</a
	>
	<span class="border-b-2 border-gray-900 pb-2 font-medium">Required fields</span>
	<a
		href={`/experiments/${data.experiment.id}/templates`}
		class="pb-2 text-gray-500 hover:text-gray-900">Recurrence templates</a
	>
	<a
		href={`/experiments/${data.experiment.id}/sessions`}
		class="pb-2 text-gray-500 hover:text-gray-900">Sessions</a
	>
</nav>

{#if form?.saved}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Saved.</p>
{/if}
{#if form?.errors?._}
	<p class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{form.errors._}</p>
{/if}

<form method="post" action="?/save" use:enhance class="mt-6 space-y-4">
	{#each fields as field, i (i)}
		<div class="grid grid-cols-12 gap-3 rounded-lg border border-gray-200 bg-white p-4">
			<label class="col-span-3">
				<span class="text-xs font-medium text-gray-700">Key</span>
				<input
					name={`fields[${i}].key`}
					bind:value={field.key}
					placeholder="age"
					class="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm"
				/>
				{#if form?.errors?.[`${i}.key`]}
					<p class="mt-1 text-xs text-red-600">{form.errors[`${i}.key`]}</p>
				{/if}
			</label>
			<label class="col-span-4">
				<span class="text-xs font-medium text-gray-700">Label</span>
				<input
					name={`fields[${i}].label`}
					bind:value={field.label}
					placeholder="Age"
					class="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
				/>
			</label>
			<label class="col-span-2">
				<span class="text-xs font-medium text-gray-700">Type</span>
				<select
					name={`fields[${i}].type`}
					bind:value={field.type}
					class="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
				>
					<option value="text">Text</option>
					<option value="email">Email</option>
					<option value="number">Number</option>
					<option value="checkbox">Checkbox</option>
				</select>
			</label>
			<label class="col-span-2 flex items-end gap-2 pb-1.5">
				<input
					type="checkbox"
					name={`fields[${i}].required`}
					bind:checked={field.required}
					class="h-4 w-4"
				/>
				<span class="text-sm text-gray-700">Required</span>
			</label>
			<div class="col-span-1 flex items-end justify-end pb-1.5">
				<button
					type="button"
					onclick={() => removeField(i)}
					class="text-sm text-red-600 hover:text-red-800">Remove</button
				>
			</div>
		</div>
	{/each}

	<div class="flex items-center gap-3">
		<button
			type="button"
			onclick={addField}
			class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
			>Add field</button
		>
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
			>Save fields</button
		>
	</div>
</form>
