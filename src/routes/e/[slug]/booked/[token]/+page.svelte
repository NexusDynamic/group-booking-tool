<script lang="ts">
	/* eslint svelte/no-navigation-without-resolve: "off" */
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let copied: string | null = $state(null);
	let manageUrl = $derived(page.url.href);

	async function copyUrl(which: 'manage' | 'calendar', url: string) {
		await navigator.clipboard.writeText(url);
		copied = which;
		setTimeout(() => (copied = null), 2000);
	}
</script>

<svelte:head>
	<title>Your booking — {data.experiment.name}</title>
</svelte:head>

<article class="mx-auto max-w-2xl py-10">
	<h1 class="text-2xl font-semibold">Booking {data.booking.status}</h1>
	<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">{data.experiment.name}</p>

	{#if data.booking.status === 'confirmed'}
		<div
			class="mt-6 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20"
		>
			<p class="font-medium text-green-900 dark:text-green-200">See you then:</p>
			<p class="mt-1 text-green-900 dark:text-green-200">{data.session.startsAtLabel}</p>
			<p class="text-sm text-green-800 dark:text-green-300">
				until {data.session.endsAtLabel}
				{#if data.session.location}
					· {data.session.location}{/if}
			</p>
			{#if data.session.notes}
				<div
					class="mt-3 rounded-md bg-green-100 p-3 text-sm text-green-800 dark:bg-green-700/30 dark:text-green-300"
				>
					{data.session.notes}
				</div>
			{/if}
		</div>

		<div
			class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20"
		>
			<h3 class="mb-2 text-lg font-semibold text-blue-900 dark:text-blue-200">
				Add to your calendar
			</h3>
			<a
				href={data.origin.replace(RegExp(`http(s?)://`), 'webcal://') +
					resolve(`/ics/session/${data.session.sessionToken}.ics`)}
				class="mt-1 mb-4 inline-block rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700"
				>Open in your calendar app</a
			>
			<h4 class="mt-2 font-medium text-blue-900 dark:text-blue-200">Subscribe</h4>
			<p class="mt-2 text-sm text-blue-800 dark:text-blue-300">
				If that doesn't work, you can use the following link to subscribe to the session in your
				calendar app (it should automatically update if changes are made):
			</p>
			<div class="mt-3 mb-4 flex gap-2">
				<input
					readonly
					value={data.origin + resolve(`/ics/session/${data.session.sessionToken}.ics`)}
					class="flex-1 rounded-md border border-blue-300 bg-white px-3 py-2 font-mono text-xs dark:border-blue-700 dark:bg-gray-800 dark:text-gray-100"
				/>
				<button
					type="button"
					onclick={() => {
						copyUrl(
							'calendar',
							data.origin + resolve(`/ics/session/${data.session.sessionToken}.ics`)
						);
					}}
					class="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700"
					>{copied === 'calendar' ? 'Copied' : 'Copy'}</button
				>
			</div>
			<!-- instructions for subscribing in various apps -->
			<p class="mt-2 text-sm text-blue-800 dark:text-blue-300">
				The method for subscribing to a calendar varies depending on the app you use. See the links
				below for instructions for common calendar apps:
			</p>
			<ul class="mt-2 ml-5 list-disc text-sm text-blue-800 dark:text-blue-300">
				<li>
					<a
						href="https://support.microsoft.com/en-us/office/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c"
						target="_blank"
						class="text-blue-600 hover:underline dark:text-blue-400">Microsoft Office / Outlook</a
					>
				</li>
				<li>
					<a
						href="https://support.google.com/calendar/answer/37100"
						target="_blank"
						class="text-blue-600 hover:underline dark:text-blue-400">Google Calendar</a
					>
				</li>
				<li>
					<a
						href="https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac"
						target="_blank"
						class="text-blue-600 hover:underline dark:text-blue-400">Apple Calendar</a
					>
				</li>
			</ul>
			<h4 class="mt-4 font-medium text-blue-900 dark:text-blue-200">Download</h4>
			<p class="mt-2 text-sm text-blue-800 dark:text-blue-300">
				You may also directly download the file to add your calendar:
			</p>
			<a
				href={resolve(`/ics/session/${data.session.sessionToken}.ics`)}
				download={`booking-${data.booking.id}.ics`}
				class="mt-2 inline-block rounded-md border border-blue-300 bg-white px-3 py-2 font-mono text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-gray-800 dark:text-blue-300 dark:hover:bg-gray-700"
			>
				Download .ics file
			</a>
			<p class="mt-2 text-sm text-blue-800 italic dark:text-blue-300">
				Note: if you use the downloaded file, it will not be able to automatically update in your
				calendar.
			</p>
		</div>

		<section
			class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
		>
			<h2 class="text-sm font-semibold text-amber-900 dark:text-amber-200">Bookmark this page</h2>
			<p class="mt-1 text-sm text-amber-900 dark:text-amber-200">
				This is the only way to cancel your booking yourself. Save the URL below somewhere safe. You
				may always contact the researcher to cancel or change your booking if you lose access to
				this page.
			</p>
			<div class="mt-3 flex gap-2">
				<input
					readonly
					value={manageUrl}
					class="flex-1 rounded-md border border-amber-300 bg-white px-3 py-2 font-mono text-xs dark:border-amber-700 dark:bg-gray-800 dark:text-gray-100"
				/>
				<button
					type="button"
					onclick={() => copyUrl('manage', manageUrl)}
					class="rounded-md border border-amber-300 bg-white px-3 py-2 text-sm hover:bg-amber-100 dark:border-amber-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
					>{copied === 'manage' ? 'Copied' : 'Copy'}</button
				>
			</div>
		</section>
	{:else if data.booking.status === 'cancelled'}
		<p class="mt-6 text-gray-700 dark:text-gray-300">This booking has been cancelled.</p>
	{:else if data.booking.status === 'attended'}
		<p class="mt-6 text-gray-700 dark:text-gray-300">
			You attended this session. Thanks for taking part.
		</p>
	{:else if data.booking.status === 'no_show'}
		<p class="mt-6 text-gray-700 dark:text-gray-300">This booking was marked as a no-show.</p>
	{/if}

	{#if form?.cancelled}
		<p
			class="mt-6 rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/30 dark:text-green-300"
		>
			Your booking has been cancelled.
		</p>
	{/if}

	{#if data.booking.status === 'confirmed'}
		<section class="mt-10">
			<h2 class="text-sm font-semibold text-gray-700 uppercase dark:text-gray-300">
				Name on booking
			</h2>
			<p class="mt-1 text-sm text-gray-800 dark:text-gray-200">{data.booking.snapshotName}</p>
			<p class="font-mono text-xs text-gray-500 dark:text-gray-400">{data.booking.snapshotEmail}</p>
		</section>

		<section
			class="mt-10 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
		>
			<h3 class="text-sm font-semibold text-red-800 dark:text-red-300">Cancel this booking</h3>
			<p class="mt-1 text-xs text-red-700 dark:text-red-400">This cannot be undone.</p>
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
					class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/30"
					>Cancel booking</button
				>
			</form>
		</section>
	{/if}
</article>
