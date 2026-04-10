<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let exp = $derived(data.experiment);
	let session = $derived(data.session);

	// Produce a "YYYY-MM-DDTHH:mm" value for the datetime-local input. This uses
	// the UTC instant directly, not the clinic-tz wall-clock — the admin will
	// edit it in their own browser timezone. Good enough for v1; we'll revisit
	// if it becomes confusing.
	function toLocalInput(d: Date) {
		const iso = new Date(d).toISOString();
		return iso.slice(0, 16);
	}

	let durationMinutes = $derived(
		Math.round((new Date(session.endsAt).getTime() - new Date(session.startsAt).getTime()) / 60000)
	);
</script>

<svelte:head>
	<title>Session — {exp.name}</title>
</svelte:head>

<a
	href={`/experiments/${exp.id}/sessions`}
	class="text-sm text-gray-500 hover:text-gray-900">← Sessions</a
>
<h1 class="mt-1 text-2xl font-semibold">{session.startsAtLabel}</h1>
<p class="mt-1 text-sm text-gray-600">
	{exp.name} ·
	<span
		class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
			session.status === 'cancelled' ? 'bg-gray-200 text-gray-700' : 'bg-green-100 text-green-800'
		}`}>{session.status}</span
	>
	{#if session.sourceTemplateId}
		<span class="ml-1 text-xs text-gray-500">(from template)</span>
	{/if}
</p>

{#if form?.saved}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Saved.</p>
{/if}
{#if form?.cancelled}
	<p class="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-800">Session cancelled.</p>
{/if}

<section class="mt-8">
	<h2 class="text-lg font-semibold">Bookings</h2>
	<p class="mt-1 text-sm text-gray-500">
		{data.bookings.length} booking{data.bookings.length === 1 ? '' : 's'} · capacity {session.capacity}
		· minimum {session.minParticipants}
	</p>
	<div class="mt-3 rounded-lg border border-gray-200 bg-white">
		{#if data.bookings.length === 0}
			<p class="px-4 py-8 text-center text-sm text-gray-500">No bookings yet.</p>
		{:else}
			<table class="w-full text-sm">
				<thead class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase">
					<tr>
						<th class="px-4 py-3">Name</th>
						<th class="px-4 py-3">Email</th>
						<th class="px-4 py-3">Status</th>
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody>
					{#each data.bookings as b (b.id)}
						<tr class="border-t border-gray-100">
							<td class="px-4 py-3">{b.snapshotName}</td>
							<td class="px-4 py-3 font-mono text-xs">{b.snapshotEmail}</td>
							<td class="px-4 py-3">{b.status}</td>
							<td class="px-4 py-3 text-right">
								{#if b.status === 'confirmed'}
									<form method="post" action="?/markAttended" use:enhance class="inline">
										<input type="hidden" name="bookingId" value={b.id} />
										<button class="text-xs text-green-700 hover:text-green-900"
											>Mark attended</button
										>
									</form>
									<form method="post" action="?/markNoShow" use:enhance class="ml-2 inline">
										<input type="hidden" name="bookingId" value={b.id} />
										<button class="text-xs text-amber-700 hover:text-amber-900"
											>No-show</button
										>
									</form>
								{:else if b.status === 'attended' || b.status === 'no_show'}
									<form
										method="post"
										action="?/unmarkAttendance"
										use:enhance
										class="inline"
									>
										<input type="hidden" name="bookingId" value={b.id} />
										<button class="text-xs text-gray-600 hover:text-gray-900">Undo</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>
</section>

<section class="mt-10">
	<h2 class="text-lg font-semibold">Edit session</h2>
	<form method="post" action="?/update" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Start (your local time)</span>
			<input
				type="datetime-local"
				name="startsAtLocal"
				required
				value={toLocalInput(session.startsAt)}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Duration (minutes)</span>
			<input
				type="number"
				name="durationMinutes"
				min="1"
				required
				value={durationMinutes}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Capacity</span>
			<input
				type="number"
				name="capacity"
				min="1"
				required
				value={session.capacity}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Min participants</span>
			<input
				type="number"
				name="minParticipants"
				min="1"
				required
				value={session.minParticipants}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="sm:col-span-2 block">
			<span class="text-sm font-medium text-gray-700">Location</span>
			<input
				name="location"
				value={session.location}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>
		<label class="sm:col-span-2 block">
			<span class="text-sm font-medium text-gray-700">Notes</span>
			<textarea
				name="notes"
				rows="3"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
				>{session.notes}</textarea
			>
		</label>
		<div class="sm:col-span-2">
			<button
				type="submit"
				class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
				>Save changes</button
			>
		</div>
	</form>
</section>

<section class="mt-12 rounded-lg border border-red-200 bg-red-50 p-4">
	<h3 class="text-sm font-semibold text-red-800">Danger zone</h3>
	<div class="mt-3 flex flex-wrap gap-2">
		{#if session.status !== 'cancelled'}
			<form method="post" action="?/cancel" use:enhance>
				<button
					type="submit"
					class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100"
					>Cancel session</button
				>
			</form>
		{/if}
		<form
			method="post"
			action="?/delete"
			use:enhance
			onsubmit={(e) => {
				if (!confirm('Delete this session? This cannot be undone.')) e.preventDefault();
			}}
		>
			<button
				type="submit"
				class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
				>Delete session</button
			>
		</form>
	</div>
</section>
