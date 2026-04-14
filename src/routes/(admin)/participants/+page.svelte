<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Participants — Group Booking</title>
</svelte:head>

<div class="flex items-center justify-between">
	<div>
		<h1 class="text-2xl font-semibold">Participants</h1>
		<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
			Everyone who has ever booked a session, with attendance tallies across all experiments.
		</p>
	</div>
	<form method="post" action="?/runJob" use:enhance>
		<button
			type="submit"
			class="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
			>Run anonymisation job</button
		>
	</form>
</div>

{#if form?.jobResult}
	<div
		class="mt-4 rounded-md bg-blue-50 p-3 text-sm text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
	>
		Job complete — bookings: {form.jobResult.bookingsAnonymised}, preferences: {form.jobResult
			.preferencesAnonymised}, participants: {form.jobResult.participantsAnonymised}, auth sessions
		deleted: {form.jobResult.authSessionsDeleted}
	</div>
{/if}

{#if form?.anonymised}
	<div
		class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300"
	>
		Participant anonymised.
	</div>
{/if}

{#if data.participants.length === 0}
	<p
		class="mt-6 rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400"
	>
		No bookings yet.
	</p>
{:else}
	<div
		class="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
	>
		<table class="w-full text-sm">
			<thead
				class="bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase dark:bg-gray-800 dark:text-gray-400"
			>
				<tr>
					<th class="px-4 py-2">Name</th>
					<th class="px-4 py-2">Email</th>
					<th class="px-4 py-2">Confirmed</th>
					<th class="px-4 py-2">Attended</th>
					<th class="px-4 py-2">No-show</th>
					<th class="px-4 py-2">Cancelled</th>
					<th class="px-4 py-2">Last activity</th>
					<th class="px-4 py-2">Status</th>
					<th class="px-4 py-2"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-100 dark:divide-gray-800">
				{#each data.participants as p (p.id)}
					<tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
						<td class="px-4 py-2 font-medium text-gray-900 dark:text-gray-100"
							>{p.displayName ?? '—'}</td
						>
						<td class="px-4 py-2 font-mono text-xs text-gray-700 dark:text-gray-300">{p.email}</td>
						<td class="px-4 py-2 text-gray-700 dark:text-gray-300">{p.confirmedCount}</td>
						<td class="px-4 py-2 text-green-700 dark:text-green-400">{p.attendedCount}</td>
						<td class="px-4 py-2 text-amber-700 dark:text-amber-400">{p.noShowCount}</td>
						<td class="px-4 py-2 text-gray-500 dark:text-gray-400">{p.cancelledCount}</td>
						<td class="px-4 py-2 text-gray-500 dark:text-gray-400">{p.lastBookingLabel ?? '—'}</td>
						<td class="px-4 py-2">
							{#if p.anonymisedAt}
								<span
									class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400"
									>Anonymised</span
								>
							{:else}
								<span
									class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400"
									>Active</span
								>
							{/if}
						</td>
						<td class="px-4 py-2">
							{#if !p.anonymisedAt}
								<form method="post" action="?/anonymise" use:enhance>
									<input type="hidden" name="participantId" value={p.id} />
									<button
										type="submit"
										onclick={(e) => {
											if (!confirm(`Anonymise ${p.displayName ?? p.email}? This cannot be undone.`))
												e.preventDefault();
										}}
										class="text-xs text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
										>Anonymise</button
									>
								</form>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
