<script lang="ts">
	import Honeypot from '#lib/components/Honeypot.svelte';
	import Alert from '#lib/components/Alert.svelte';
	import { backLink, inputClass } from '#lib/styles.js';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import ParticipantFields from '#lib/components/ParticipantFields.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Pick multiple sessions — {data.experiment.name}</title>
</svelte:head>

<article class="mx-auto max-w-2xl py-10">
	<a href={resolve(`e/${data.experiment.slug}`)} class={backLink}>← {data.experiment.name}</a>
	<h1 class="mt-1 text-2xl font-semibold">Pick several sessions</h1>
	<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
		Tick every session that could work for you. The researcher will pick one and confirm.
	</p>

	{#if form?.error}
		<Alert variant="error">{form.error}</Alert>
	{/if}

	{#if data.sessions.length === 0}
		<p class="mt-6 text-gray-600 dark:text-gray-400">
			No upcoming sessions are available right now.
		</p>
	{:else}
		<form method="post" action="?/submit" use:enhance class="mt-6 space-y-6">
			<fieldset>
				<legend class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Candidate sessions</legend
				>
				<div class="mt-2 space-y-2">
					{#each data.sessions as s (s.id)}
						<label
							class={`flex items-center gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 ${
								s.isFull
									? 'cursor-not-allowed opacity-60'
									: 'hover:border-gray-400 dark:hover:border-gray-500'
							}`}
						>
							<input
								type="checkbox"
								name="sessionIds"
								value={s.id}
								disabled={s.isFull}
								class="h-4 w-4"
							/>
							<div class="flex-1">
								<div class="font-medium">{s.startsAtLabel}</div>
								<div class="text-xs text-gray-500 dark:text-gray-400">until {s.endsAtLabel}</div>
							</div>
							<div class="font-mono text-xs text-gray-500 dark:text-gray-400">
								{s.confirmedCount}/{s.capacity}
							</div>
						</label>
					{/each}
				</div>
				{#if form?.errors?.sessionIds}
					<p class="mt-2 text-sm text-red-600 dark:text-red-400">{form.errors.sessionIds}</p>
				{/if}
			</fieldset>

			<div class="space-y-4">
				<ParticipantFields
					requiredFields={data.requiredFields}
					values={form?.values}
					errors={form?.errors}
					privacyPolicyUrl={data.privacyNotice.url}
				/>

				<label class="block">
					<span class="text-sm text-gray-700 dark:text-gray-300">Notes (optional)</span>
					<textarea name="notes" rows="3" class={inputClass}>{form?.values?.notes ?? ''}</textarea>
				</label>
			</div>

			<Honeypot />

			{#if data.privacyNotice.text}
				<p class="text-xs text-gray-500 dark:text-gray-400">
					{data.privacyNotice.text}
				</p>
			{/if}
			<button
				type="submit"
				class="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
				>Submit candidates</button
			>
		</form>
	{/if}
</article>
