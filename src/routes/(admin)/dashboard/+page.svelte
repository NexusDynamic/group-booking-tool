<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Dashboard — Group Booking</title>
</svelte:head>

<h1 class="text-2xl font-semibold">Welcome, {data.user.name}</h1>
<p class="mt-2 text-gray-600">Overview of your experiments and upcoming activity.</p>

<div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase">Experiments</div>
		<div class="mt-2 text-3xl font-semibold text-gray-900">{data.counts.experiments}</div>
		<div class="mt-1 text-xs text-gray-500">{data.counts.publishedExperiments} published</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase">Upcoming sessions</div>
		<div class="mt-2 text-3xl font-semibold text-gray-900">{data.counts.upcomingSessions}</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase">Below minimum</div>
		<div
			class="mt-2 text-3xl font-semibold {data.counts.belowMinimum > 0
				? 'text-amber-700'
				: 'text-gray-900'}"
		>
			{data.counts.belowMinimum}
		</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<div class="text-xs font-medium tracking-wide text-gray-500 uppercase">Pending prefs</div>
		<div class="mt-2 text-3xl font-semibold text-gray-900">{data.counts.pendingPreferences}</div>
	</div>
	<div class="rounded-lg border border-gray-200 bg-white p-4">
		<a href="/experiments" class="text-xs font-medium text-gray-500 uppercase hover:text-gray-900"
			>Quick links →</a
		>
		<ul class="mt-2 space-y-1 text-sm">
			<li><a href="/experiments" class="text-gray-700 hover:text-gray-900">Experiments</a></li>
			<li><a href="/participants" class="text-gray-700 hover:text-gray-900">Participants</a></li>
		</ul>
	</div>
</div>

<section class="mt-8">
	<div class="flex items-baseline justify-between">
		<h2 class="text-lg font-semibold">Upcoming sessions</h2>
		{#if data.upcoming.length > 0}
			<span class="text-xs text-gray-500">Next {data.upcoming.length}</span>
		{/if}
	</div>

	{#if data.upcoming.length === 0}
		<p class="mt-4 rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600">
			No upcoming scheduled sessions. Create one from an experiment's sessions page.
		</p>
	{:else}
		<div class="mt-4 overflow-hidden rounded-lg border border-gray-200 bg-white">
			<table class="w-full text-sm">
				<thead class="bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
					<tr>
						<th class="px-4 py-2">Experiment</th>
						<th class="px-4 py-2">Starts</th>
						<th class="px-4 py-2">Bookings</th>
						<th class="px-4 py-2">Status</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-gray-100">
					{#each data.upcoming as u (u.id)}
						<tr class="hover:bg-gray-50">
							<td class="px-4 py-2">
								<a
									href={`/experiments/${u.experimentId}/sessions/${u.id}`}
									class="font-medium text-gray-900 hover:underline">{u.experimentName}</a
								>
							</td>
							<td class="px-4 py-2 text-gray-700">{u.startsAtLabel}</td>
							<td class="px-4 py-2 text-gray-700">{u.confirmedCount}/{u.capacity}</td>
							<td class="px-4 py-2">
								{#if u.full}
									<span class="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
										Full
									</span>
								{:else if u.belowMinimum}
									<span class="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
										Below min ({u.minParticipants})
									</span>
								{:else}
									<span class="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
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
