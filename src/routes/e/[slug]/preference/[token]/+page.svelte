<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let copied = $state(false);
	let manageUrl = $derived(page.url.href);

	async function copyUrl() {
		await navigator.clipboard.writeText(manageUrl);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}

	let rruleSummary = $derived(
		data.preference.rrule
			? data.preference.rrule.match(/BYDAY=([^;]+)/)?.[1] ?? data.preference.rrule
			: ''
	);
</script>

<svelte:head>
	<title>Your availability — {data.experiment.name}</title>
</svelte:head>

<article class="mx-auto max-w-2xl py-10">
	<h1 class="text-2xl font-semibold">Availability {data.preference.status}</h1>
	<p class="mt-1 text-sm text-gray-600">{data.experiment.name}</p>

	{#if data.preference.status === 'pending'}
		<div class="mt-6 rounded-lg border border-gray-200 bg-white p-4 text-sm">
			<p class="font-medium">You're in the queue.</p>
			<p class="mt-1 text-gray-600">
				The researcher will review your availability and assign you to a session. You don't need
				to do anything else — come back to this URL to check your status.
			</p>
		</div>

		<section class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
			<h2 class="text-sm font-semibold text-amber-900">Bookmark this page</h2>
			<p class="mt-1 text-sm text-amber-900">
				It's the only way to withdraw your preference. Save the URL below.
			</p>
			<div class="mt-3 flex gap-2">
				<input
					readonly
					value={manageUrl}
					class="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-xs"
				/>
				<button
					type="button"
					onclick={copyUrl}
					class="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm hover:bg-amber-100"
					>{copied ? 'Copied' : 'Copy'}</button
				>
			</div>
		</section>

		<section class="mt-10 rounded-lg border border-red-200 bg-red-50 p-4">
			<h3 class="text-sm font-semibold text-red-800">Withdraw</h3>
			<form
				method="post"
				action="?/withdraw"
				use:enhance
				onsubmit={(e) => {
					if (!confirm('Withdraw your availability?')) e.preventDefault();
				}}
				class="mt-3"
			>
				<button
					type="submit"
					class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
					>Withdraw</button
				>
			</form>
		</section>
	{:else if data.preference.status === 'assigned'}
		<p class="mt-6 text-sm text-gray-700">
			The researcher assigned you to session(s). Check your calendar or the booking confirmation
			you received.
		</p>
	{:else if data.preference.status === 'withdrawn'}
		<p class="mt-6 text-sm text-gray-700">You withdrew this availability.</p>
	{:else if data.preference.status === 'declined'}
		<p class="mt-6 text-sm text-gray-700">
			The researcher couldn't fit you into any session. Please contact them directly if you'd
			still like to take part.
		</p>
	{/if}

	{#if form?.withdrawn}
		<p class="mt-6 rounded-md bg-green-50 p-3 text-sm text-green-800">Your availability has been withdrawn.</p>
	{/if}

	<section class="mt-10">
		<h2 class="text-sm font-semibold text-gray-700 uppercase">Your submission</h2>
		<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
			<dt class="text-gray-500">Name</dt>
			<dd>{data.preference.snapshotName}</dd>
			<dt class="text-gray-500">Email</dt>
			<dd class="font-mono text-xs">{data.preference.snapshotEmail}</dd>
			{#if data.preference.kind === 'recurring'}
				<dt class="text-gray-500">Days</dt>
				<dd class="font-mono">{rruleSummary}</dd>
				<dt class="text-gray-500">From</dt>
				<dd>{data.preference.dtstartLocal} ({data.preference.durationMinutes} min)</dd>
				{#if data.preference.windowStartLabel || data.preference.windowEndLabel}
					<dt class="text-gray-500">Window</dt>
					<dd>
						{data.preference.windowStartLabel ?? '…'} → {data.preference.windowEndLabel ?? '…'}
					</dd>
				{/if}
			{/if}
			{#if data.preference.notes}
				<dt class="text-gray-500">Notes</dt>
				<dd class="whitespace-pre-line">{data.preference.notes}</dd>
			{/if}
		</dl>
	</section>
</article>
