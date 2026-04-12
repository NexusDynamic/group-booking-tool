<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Dashboard — Group Booking</title>
</svelte:head>

<h1 class="text-2xl font-semibold">Welcome, {data.user.name}</h1>
<p class="mt-2 text-gray-600 dark:text-gray-400">
	Overview of your experiments and upcoming activity.
</p>

<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
	<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
			Experiments
		</div>
		<div class="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">
			{data.counts.experiments}
		</div>
		<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">
			{data.counts.publishedExperiments} published
		</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
			Upcoming sessions
		</div>
		<div class="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">
			{data.counts.upcomingSessions}
		</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
			Below minimum
		</div>
		<div
			class="mt-2 text-3xl font-semibold {data.counts.belowMinimum > 0
				? 'text-amber-700 dark:text-amber-400'
				: 'text-gray-900 dark:text-gray-100'}"
		>
			{data.counts.belowMinimum}
		</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
			Pending prefs
		</div>
		<div class="mt-2 text-3xl font-semibold text-gray-900 dark:text-gray-100">
			{data.counts.pendingPreferences}
		</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
		<a
			href={resolve('/experiments')}
			class="text-xs font-medium text-gray-500 uppercase hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
			>Quick links →</a
		>
		<ul class="mt-2 space-y-1 text-sm">
			<li>
				<a
					href={resolve('/experiments')}
					class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
					>Experiments</a
				>
			</li>
			<li>
				<a
					href={resolve('/participants')}
					class="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
					>Participants</a
				>
			</li>
		</ul>
	</div>
</div>

<section class="mt-8">
	<div class="flex items-baseline justify-between">
		<h2 class="text-lg font-semibold">Upcoming sessions</h2>
		{#if data.upcoming.length > 0}
			<span class="text-xs text-gray-500 dark:text-gray-400">Next {data.upcoming.length}</span>
		{/if}
	</div>

	{#if data.upcoming.length === 0}
		<p
			class="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400"
		>
			No upcoming scheduled sessions. Create one from an experiment's sessions page.
		</p>
	{:else}
		<div
			class="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
		>
			<table class="w-full text-sm">
				<thead
					class="bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:bg-gray-800 dark:text-gray-400"
				>
					<tr>
						<th class="px-4 py-2">Experiment</th>
						<th class="px-4 py-2">Starts</th>
						<th class="px-4 py-2">Bookings</th>
						<th class="px-4 py-2">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100 dark:divide-gray-800">
					{#each data.upcoming as u (u.id)}
						<tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
							<td class="px-4 py-2">
								<a
									href={resolve(`/experiments/${u.experimentId}/sessions/${u.id}`)}
									class="font-medium text-gray-900 hover:underline dark:text-gray-100"
									>{u.experimentName}</a
								>
							</td>
							<td class="px-4 py-2 text-gray-700 dark:text-gray-300">{u.startsAtLabel}</td>
							<td class="px-4 py-2 text-gray-700 dark:text-gray-300">
								{u.confirmedCount}/{u.capacity}
							</td>
							<td class="px-4 py-2">
								{#if u.full}
									<span
										class="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
									>
										Full
									</span>
								{:else if u.belowMinimum}
									<span
										class="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
									>
										Below min ({u.minParticipants})
									</span>
								{:else}
									<span
										class="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300"
									>
										OK
									</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>
