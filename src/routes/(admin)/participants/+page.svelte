<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Participants — Group Booking</title>
</svelte:head>

<h1 class="text-2xl font-semibold">Participants</h1>
<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
	Everyone who has ever booked a session, with attendance tallies across all experiments.
</p>

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
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
