<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let exp = $derived(data.experiment);
</script>

<svelte:head>
	<title>{exp.name}</title>
</svelte:head>

<article class="mx-auto max-w-2xl py-10">
	<h1 class="text-3xl font-semibold">{exp.name}</h1>
	<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{exp.durationMinutes} min session</p>

	{#if exp.description}
		<p class="mt-6 whitespace-pre-line text-gray-800 dark:text-gray-200">{exp.description}</p>
	{/if}

	{#if exp.inclusionCriteria}
		<section class="mt-6">
			<h2 class="text-sm font-semibold text-gray-700 uppercase dark:text-gray-300">
				Inclusion criteria
			</h2>
			<p class="mt-1 text-sm whitespace-pre-line text-gray-700 dark:text-gray-300">
				{exp.inclusionCriteria}
			</p>
		</section>
	{/if}
	{#if exp.exclusionCriteria}
		<section class="mt-4">
			<h2 class="text-sm font-semibold text-gray-700 uppercase dark:text-gray-300">
				Exclusion criteria
			</h2>
			<p class="mt-1 text-sm whitespace-pre-line text-gray-700 dark:text-gray-300">
				{exp.exclusionCriteria}
			</p>
		</section>
	{/if}

	<section class="mt-10">
		<h2 class="text-lg font-semibold">Sign up</h2>
		<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">Choose a sign-up method.</p>
		<div class="mt-4 grid gap-3 sm:grid-cols-2">
			<a
				href={`/e/${exp.slug}/sessions`}
				class="rounded-lg border border-gray-200 bg-white p-4 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
			>
				<div class="font-medium">Pick a session</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
					Book one specific time slot right away.
				</p>
			</a>
			<a
				href={`/e/${exp.slug}/multi`}
				class="rounded-lg border border-gray-200 bg-white p-4 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
			>
				<div class="font-medium">Pick several candidates</div>
				<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
					Tick slots that could work; researcher picks one.
				</p>
			</a>
		</div>
	</section>

	{#if data.upcoming.length > 0}
		<section class="mt-10">
			<h2 class="text-sm font-semibold text-gray-700 uppercase dark:text-gray-300">
				Next available sessions
			</h2>
			<ul class="mt-3 space-y-2 text-sm">
				{#each data.upcoming as s (s.id)}
					<li
						class="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
					>
						<span>{s.startsAtLabel}</span>
						<span class="font-mono text-xs text-gray-500 dark:text-gray-400"
							>{s.confirmedCount}/{s.capacity}</span
						>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</article>
