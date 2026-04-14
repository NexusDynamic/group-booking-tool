<script lang="ts">
	import type { RequiredField } from '$lib/schemas/experiment';
	import { resolve } from '$app/paths';

	interface Props {
		requiredFields: RequiredField[];
		values?: Record<string, string>;
		errors?: Record<string, string>;
		privacyPolicyUrl?: string;
	}

	const privacyPolicyUrl = '/privacy';

	let { requiredFields, values, errors }: Props = $props();
</script>

<label class="block">
	<span class="text-sm text-gray-700 dark:text-gray-300">Name</span>
	<input
		name="name"
		required
		value={values?.name ?? ''}
		class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
	/>
	{#if errors?.name}
		<p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
	{/if}
</label>

<label class="block">
	<span class="text-sm text-gray-700 dark:text-gray-300">Email</span>
	<input
		type="email"
		name="email"
		required
		value={values?.email ?? ''}
		class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
	/>
	{#if errors?.email}
		<p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
	{/if}
</label>

{#each requiredFields as f (f.key)}
	<label class="block">
		<span class="text-sm text-gray-700 dark:text-gray-300"
			>{f.label}{#if f.required}<span class="ml-0.5 text-red-600 dark:text-red-400">*</span
				>{/if}</span
		>
		{#if f.type === 'checkbox'}
			<input
				type="checkbox"
				name={`field_${f.key}`}
				checked={values?.[`field_${f.key}`] === 'on'}
				class="mt-1 h-4 w-4"
			/>
		{:else if f.type === 'number'}
			<input
				type="number"
				name={`field_${f.key}`}
				required={f.required}
				value={values?.[`field_${f.key}`] ?? ''}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		{:else if f.type === 'email'}
			<input
				type="email"
				name={`field_${f.key}`}
				required={f.required}
				value={values?.[`field_${f.key}`] ?? ''}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		{:else}
			<input
				type="text"
				name={`field_${f.key}`}
				required={f.required}
				value={values?.[`field_${f.key}`] ?? ''}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		{/if}
		{#if errors?.[`field_${f.key}`]}
			<p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors[`field_${f.key}`]}</p>
		{/if}
	</label>
{/each}

<label class="flex items-start gap-2">
	<input
		type="checkbox"
		name="consent"
		required
		checked={values?.consent === 'on'}
		class="mt-1 h-4 w-4 shrink-0"
	/>
	<span class="text-sm text-gray-700 dark:text-gray-300">
		I have read and acknowledge the
		<a
			href={resolve(privacyPolicyUrl)}
			target="_blank"
			rel="noopener noreferrer"
			class="underline hover:text-gray-900 dark:hover:text-gray-100">privacy notice</a
		>.
	</span>
</label>
{#if errors?.consent}
	<p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.consent}</p>
{/if}
