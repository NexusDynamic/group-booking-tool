<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import ParticipantFields from '$lib/components/ParticipantFields.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Share your availability — {data.experiment.name}</title>
</svelte:head>

<article class="mx-auto max-w-2xl py-10">
	<a
		href={resolve(`/e/${data.experiment.slug}`)}
		class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>← {data.experiment.name}</a
	>
	<h1 class="mt-1 text-2xl font-semibold">Share your availability</h1>
	<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
		Describe a recurring time slot you can make. The researcher will review and assign you to
		concrete sessions — you'll receive a self-manage link on the next page.
	</p>

	{#if form?.error}
		<p
			class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300"
		>
			{form.error}
		</p>
	{/if}

	<form method="post" action="?/submit" use:enhance class="mt-6 space-y-4">
		<ParticipantFields
			requiredFields={data.requiredFields}
			values={form?.values}
			errors={form?.errors}
			privacyPolicyUrl={data.privacyNotice.url || '/privacy'}
		/>

		<label class="block">
			<span class="text-sm text-gray-700 dark:text-gray-300">Weekdays you're available</span>
			<input
				name="byDay"
				required
				placeholder="MO,WE"
				value={form?.values?.byDay ?? ''}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 font-mono uppercase dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
				Comma-separated: MO, TU, WE, TH, FR, SA, SU
			</p>
			{#if form?.errors?.byDay}
				<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.byDay}</p>
			{/if}
		</label>
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="block">
				<span class="text-sm text-gray-700 dark:text-gray-300">Start of slot (local)</span>
				<input
					type="datetime-local"
					name="dtstartLocal"
					required
					value={form?.values?.dtstartLocal ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
				{#if form?.errors?.dtstartLocal}
					<p class="mt-1 text-sm text-red-600 dark:text-red-400">{form.errors.dtstartLocal}</p>
				{/if}
			</label>
			<label class="block">
				<span class="text-sm text-gray-700 dark:text-gray-300">Duration (minutes)</span>
				<input
					type="number"
					name="durationMinutes"
					min="1"
					required
					value={form?.values?.durationMinutes ?? 60}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<label class="block">
				<span class="text-sm text-gray-700 dark:text-gray-300">Available from (optional)</span>
				<input
					type="date"
					name="windowStart"
					value={form?.values?.windowStart ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-gray-700 dark:text-gray-300">Available until (optional)</span>
				<input
					type="date"
					name="windowEnd"
					value={form?.values?.windowEnd ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				/>
			</label>
		</div>
		<label class="block">
			<span class="text-sm text-gray-700 dark:text-gray-300"
				>Notes for the researcher (optional)</span
			>
			<textarea
				name="notes"
				rows="3"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				>{form?.values?.notes ?? ''}</textarea
			>
		</label>
		<div aria-hidden="true" style="position:absolute;left:-10000px">
			<input type="text" name="honeypot" tabindex="-1" autocomplete="off" />
		</div>

		{#if data.privacyNotice.text}
			<p class="text-xs text-gray-500 dark:text-gray-400">
				{#if data.privacyNotice.text}{data.privacyNotice.text}{/if}
			</p>
		{/if}

		<button
			type="submit"
			class="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
			>Submit availability</button
		>
	</form>
</article>
