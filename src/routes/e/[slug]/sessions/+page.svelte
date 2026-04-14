<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import ParticipantFields from '$lib/components/ParticipantFields.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Remember the selected session across failed submissions. Initialised
	// once (via untrack) so Svelte 5 doesn't treat this as a tracked capture.
	let selectedSessionId = $state<string>(
		untrack(() => (form?.sessionId as string | undefined) ?? '')
	);
	let startedAt = $state(new Date().toISOString());
</script>

<svelte:head>
	<title>Sign up — {data.experiment.name}</title>
</svelte:head>

<article class="mx-auto max-w-2xl py-10">
	<a
		href={resolve(`/e/${data.experiment.slug}`)}
		class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
		>← {data.experiment.name}</a
	>
	<h1 class="mt-1 text-2xl font-semibold">Pick a session</h1>

	{#if form?.error}
		<p
			class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300"
		>
			{form.error}
		</p>
	{/if}

	{#if data.sessions.length === 0}
		<p class="mt-6 text-gray-600 dark:text-gray-400">
			No upcoming sessions available. Please check back later.
		</p>
	{:else}
		<form method="post" action="?/book" use:enhance class="mt-6 space-y-6">
			<fieldset>
				<legend class="text-sm font-medium text-gray-700 dark:text-gray-300"
					>Available sessions</legend
				>
				<div class="mt-2 space-y-2">
					{#each data.sessions as s (s.id)}
						<label
							class={`flex items-center gap-3 rounded-md border px-4 py-3 ${
								s.isFull
									? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800'
									: selectedSessionId === s.id
										? 'border-gray-900 bg-white dark:border-gray-300 dark:bg-gray-800'
										: 'border-gray-200 bg-white hover:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-500'
							}`}
						>
							<input
								type="radio"
								name="sessionId"
								value={s.id}
								bind:group={selectedSessionId}
								disabled={s.isFull}
								class="h-4 w-4"
							/>
							<div class="flex-1">
								<div class="font-medium">{s.startsAtLabel}</div>
								<div class="text-xs text-gray-500 dark:text-gray-400">
									until {s.endsAtLabel}
									{#if s.location}
										· {s.location}{/if}
								</div>
							</div>
							<div class="font-mono text-xs text-gray-500 dark:text-gray-400">
								{s.confirmedCount}/{s.capacity}
							</div>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset class="space-y-4">
				<legend class="text-sm font-medium text-gray-700 dark:text-gray-300">Your details</legend>
				<ParticipantFields
					requiredFields={data.requiredFields}
					values={form?.values}
					errors={form?.errors}
					privacyPolicyUrl={data.privacyNotice.url || '/privacy'}
				/>
			</fieldset>

			<!-- honeypot: real users never fill this in -->
			<div aria-hidden="true" style="position:absolute;left:-10000px">
				<label>
					Leave this blank
					<input type="text" name="honeypot" tabindex="-1" autocomplete="off" />
				</label>
			</div>
			<input type="hidden" name="startedAt" value={startedAt} />

			{#if data.privacyNotice.text || data.privacyNotice.url}
				<p class="text-xs text-gray-500 dark:text-gray-400">
					{#if data.privacyNotice.text}{data.privacyNotice.text}{/if}
					{#if data.privacyNotice.url}
						{' '}<a
							href={data.privacyNotice.url}
							target="_blank"
							rel="noopener noreferrer"
							class="underline hover:text-gray-700 dark:hover:text-gray-300">Privacy policy</a
						>
					{/if}
				</p>
			{/if}

			<button
				type="submit"
				class="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
				disabled={!selectedSessionId}
			>
				Confirm booking
			</button>
		</form>
	{/if}
</article>
