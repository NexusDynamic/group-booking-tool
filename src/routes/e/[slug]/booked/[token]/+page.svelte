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
</script>

<svelte:head>
	<title>Your booking — {data.experiment.name}</title>
</svelte:head>

<article class="mx-auto max-w-2xl py-10">
	<h1 class="text-2xl font-semibold">Booking {data.booking.status}</h1>
	<p class="mt-1 text-sm text-gray-600">{data.experiment.name}</p>

	{#if data.booking.status === 'confirmed'}
		<div class="mt-6 rounded-lg border border-green-200 bg-green-50 p-4">
			<p class="font-medium text-green-900">See you then:</p>
			<p class="mt-1 text-green-900">{data.session.startsAtLabel}</p>
			<p class="text-sm text-green-800">
				until {data.session.endsAtLabel}
				{#if data.session.location} · {data.session.location}{/if}
			</p>
		</div>

		<section class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
			<h2 class="text-sm font-semibold text-amber-900">Bookmark this page</h2>
			<p class="mt-1 text-sm text-amber-900">
				This is the only way to cancel your booking. Save the URL below somewhere safe.
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
	{:else if data.booking.status === 'cancelled'}
		<p class="mt-6 text-gray-700">This booking has been cancelled.</p>
	{:else if data.booking.status === 'attended'}
		<p class="mt-6 text-gray-700">You attended this session. Thanks for taking part.</p>
	{:else if data.booking.status === 'no_show'}
		<p class="mt-6 text-gray-700">This booking was marked as a no-show.</p>
	{/if}

	{#if form?.cancelled}
		<p class="mt-6 rounded-md bg-green-50 p-3 text-sm text-green-800">
			Your booking has been cancelled.
		</p>
	{/if}

	{#if data.booking.status === 'confirmed'}
		<section class="mt-10">
			<h2 class="text-sm font-semibold text-gray-700 uppercase">Name on booking</h2>
			<p class="mt-1 text-sm text-gray-800">{data.booking.snapshotName}</p>
			<p class="font-mono text-xs text-gray-500">{data.booking.snapshotEmail}</p>
		</section>

		<section class="mt-10 rounded-lg border border-red-200 bg-red-50 p-4">
			<h3 class="text-sm font-semibold text-red-800">Cancel this booking</h3>
			<p class="mt-1 text-xs text-red-700">This cannot be undone.</p>
			<form
				method="post"
				action="?/cancel"
				use:enhance
				onsubmit={(e) => {
					if (!confirm('Cancel your booking?')) e.preventDefault();
				}}
				class="mt-3"
			>
				<button
					type="submit"
					class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
					>Cancel booking</button
				>
			</form>
		</section>
	{/if}
</article>
