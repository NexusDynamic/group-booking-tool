<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import Card from '$lib/components/Card.svelte';
	import { resolve } from '$app/paths';

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

	let copied = $state<boolean>(false);

	async function copy() {
		const url = data.sessionCalendarUrl;
		await navigator.clipboard.writeText(url);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head>
	<title>Session — {exp.name}</title>
</svelte:head>

<a
	href={resolve(`/experiments/${exp.id}/sessions`)}
	class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>← Sessions</a
>
<h1 class="mt-1 text-2xl font-semibold">{session.startsAtLabel}</h1>

<ExperimentNav />
<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
	{exp.name} ·
	<span
		class={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
			session.status === 'cancelled'
				? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
				: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
		}`}>{session.status}</span
	>
	{#if session.sourceTemplateId}
		<span class="ml-1 text-xs text-gray-500 dark:text-gray-400">(from template)</span>
	{/if}
</p>

{#if form?.saved}
	<Alert variant="success">Saved.</Alert>
{/if}
{#if form?.cancelled}
	<Alert variant="success">Session cancelled.</Alert>
{/if}

<section class="mt-8">
	<Card class="p-4">
		<h2 class="font-semibold">Session iCal url</h2>
		<div class="mt-3 flex gap-2">
			<input
				readonly
				value={data.sessionCalendarUrl}
				class="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<button
				type="button"
				onclick={() => copy()}
				class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
				>{copied ? 'Copied' : 'Copy'}</button
			>
		</div>
	</Card>
</section>
<section class="mt-8">
	<h2 class="text-lg font-semibold">Bookings</h2>
	<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
		{data.bookings.length} booking{data.bookings.length === 1 ? '' : 's'} · capacity {session.capacity}
		· minimum {session.minParticipants}
	</p>
	<Card class="mt-3">
		{#if data.bookings.length === 0}
			<p class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No bookings yet.</p>
		{:else}
			<table class="w-full text-sm">
				<thead
					class="bg-gray-50 text-left text-xs font-medium text-gray-600 uppercase dark:bg-gray-800 dark:text-gray-400"
				>
					<tr>
						<th class="px-4 py-3">Name</th>
						<th class="px-4 py-3">Email</th>
						<th class="px-4 py-3">Status</th>
						<th class="px-4 py-3"></th>
					</tr>
				</thead>
				<tbody>
					{#each data.bookings as b (b.id)}
						<tr class="border-t border-gray-100 dark:border-gray-800">
							<td class="px-4 py-3">{b.snapshotName}</td>
							<td class="px-4 py-3 font-mono text-xs">{b.snapshotEmail}</td>
							<td class="px-4 py-3">{b.status}</td>
							<td class="px-4 py-3 text-right">
								{#if b.status === 'confirmed'}
									<form method="post" action="?/markAttended" use:enhance class="inline">
										<input type="hidden" name="bookingId" value={b.id} />
										<button
											class="text-xs text-green-700 hover:text-green-900 dark:text-green-400 dark:hover:text-green-300"
											>Mark attended</button
										>
									</form>
									<form method="post" action="?/markNoShow" use:enhance class="ml-2 inline">
										<input type="hidden" name="bookingId" value={b.id} />
										<button
											class="text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
											>No-show</button
										>
									</form>
								{:else if b.status === 'attended' || b.status === 'no_show'}
									<form method="post" action="?/unmarkAttendance" use:enhance class="inline">
										<input type="hidden" name="bookingId" value={b.id} />
										<button
											class="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
											>Undo</button
										>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</Card>
</section>

<section class="mt-10">
	<h2 class="text-lg font-semibold">Edit session</h2>
	<form method="post" action="?/update" use:enhance class="mt-4 grid gap-4 sm:grid-cols-2">
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300"
				>Start (your local time)</span
			>
			<input
				type="datetime-local"
				name="startsAtLocal"
				required
				value={toLocalInput(session.startsAt)}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Duration (minutes)</span>
			<input
				type="number"
				name="durationMinutes"
				min="1"
				required
				value={durationMinutes}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Capacity</span>
			<input
				type="number"
				name="capacity"
				min="1"
				required
				value={session.capacity}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Min participants</span>
			<input
				type="number"
				name="minParticipants"
				min="1"
				required
				value={session.minParticipants}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="block sm:col-span-2">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Location</span>
			<input
				name="location"
				value={session.location}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
		</label>
		<label class="block sm:col-span-2">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Notes</span>
			<textarea
				name="notes"
				rows="3"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
				>{session.notes}</textarea
			>
		</label>
		<div class="sm:col-span-2">
			<button
				type="submit"
				class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
				>Save changes</button
			>
		</div>
	</form>
</section>

<section
	class="mt-12 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
>
	<h3 class="text-sm font-semibold text-red-800 dark:text-red-300">Danger zone</h3>
	<div class="mt-3 flex flex-wrap gap-2">
		{#if session.status !== 'cancelled'}
			<form method="post" action="?/cancel" use:enhance>
				<button
					type="submit"
					class="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-gray-800 dark:text-amber-400 dark:hover:bg-amber-900/30"
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
				class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
				>Delete session</button
			>
		</form>
	</div>
</section>
