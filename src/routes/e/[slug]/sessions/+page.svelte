<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

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
	<a href={`/e/${data.experiment.slug}`} class="text-sm text-gray-500 hover:text-gray-900"
		>← {data.experiment.name}</a
	>
	<h1 class="mt-1 text-2xl font-semibold">Pick a session</h1>

	{#if form?.error}
		<p class="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">{form.error}</p>
	{/if}

	{#if data.sessions.length === 0}
		<p class="mt-6 text-gray-600">No upcoming sessions available. Please check back later.</p>
	{:else}
		<form method="post" action="?/book" use:enhance class="mt-6 space-y-6">
			<fieldset>
				<legend class="text-sm font-medium text-gray-700">Available sessions</legend>
				<div class="mt-2 space-y-2">
					{#each data.sessions as s (s.id)}
						<label
							class={`flex items-center gap-3 rounded-md border px-4 py-3 ${
								s.isFull
									? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
									: selectedSessionId === s.id
										? 'border-gray-900 bg-white'
										: 'border-gray-200 bg-white hover:border-gray-400'
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
								<div class="text-xs text-gray-500">
									until {s.endsAtLabel}
									{#if s.location} · {s.location}{/if}
								</div>
							</div>
							<div class="font-mono text-xs text-gray-500">{s.confirmedCount}/{s.capacity}</div>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset class="space-y-4">
				<legend class="text-sm font-medium text-gray-700">Your details</legend>
				<label class="block">
					<span class="text-sm text-gray-700">Name</span>
					<input
						name="name"
						required
						value={form?.values?.name ?? ''}
						class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					/>
					{#if form?.errors?.name}
						<p class="mt-1 text-sm text-red-600">{form.errors.name}</p>
					{/if}
				</label>
				<label class="block">
					<span class="text-sm text-gray-700">Email</span>
					<input
						type="email"
						name="email"
						required
						value={form?.values?.email ?? ''}
						class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
					/>
					{#if form?.errors?.email}
						<p class="mt-1 text-sm text-red-600">{form.errors.email}</p>
					{/if}
				</label>

				{#each data.requiredFields as f (f.key)}
					<label class="block">
						<span class="text-sm text-gray-700"
							>{f.label}{#if f.required}<span class="ml-0.5 text-red-600">*</span>{/if}</span
						>
						{#if f.type === 'checkbox'}
							<input
								type="checkbox"
								name={`field_${f.key}`}
								checked={form?.values?.[`field_${f.key}`] === 'on'}
								class="mt-1 h-4 w-4"
							/>
						{:else if f.type === 'number'}
							<input
								type="number"
								name={`field_${f.key}`}
								required={f.required}
								value={form?.values?.[`field_${f.key}`] ?? ''}
								class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
							/>
						{:else if f.type === 'email'}
							<input
								type="email"
								name={`field_${f.key}`}
								required={f.required}
								value={form?.values?.[`field_${f.key}`] ?? ''}
								class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
							/>
						{:else}
							<input
								type="text"
								name={`field_${f.key}`}
								required={f.required}
								value={form?.values?.[`field_${f.key}`] ?? ''}
								class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
							/>
						{/if}
						{#if form?.errors?.[`field_${f.key}`]}
							<p class="mt-1 text-sm text-red-600">{form.errors[`field_${f.key}`]}</p>
						{/if}
					</label>
				{/each}
			</fieldset>

			<!-- honeypot: real users never fill this in -->
			<div aria-hidden="true" style="position:absolute;left:-10000px">
				<label>
					Leave this blank
					<input type="text" name="honeypot" tabindex="-1" autocomplete="off" />
				</label>
			</div>
			<input type="hidden" name="startedAt" value={startedAt} />

			<button
				type="submit"
				class="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
				disabled={!selectedSessionId}
			>
				Confirm booking
			</button>
		</form>
	{/if}
</article>
