<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import Footer from '$lib/components/Footer.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in — Group Booking</title>
</svelte:head>

<div
	class="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950"
>
	<div class="fixed top-3 right-3 z-50">
		<ThemeToggle />
	</div>
	<div
		class="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-900"
	>
		<h1 class="mb-6 text-2xl font-semibold dark:text-white">Researcher sign-in</h1>
		<form method="post" use:enhance class="space-y-4">
			<input type="hidden" name="next" value={data.next} />
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Email</span>
				<input
					type="email"
					name="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-gray-400 dark:focus:ring-gray-400"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300">Password</span>
				<input
					type="password"
					name="password"
					autocomplete="current-password"
					required
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-gray-400 dark:focus:ring-gray-400"
				/>
			</label>
			{#if form?.error}
				<p class="text-sm text-red-600 dark:text-red-400">{form.error}</p>
			{/if}
			<button
				type="submit"
				class="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
			>
				Sign in
			</button>
		</form>
		<p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
			No self-service signup. Admin is created via <code
				class="rounded bg-gray-100 px-1 dark:bg-gray-800">pnpm seed:admin</code
			>.
		</p>
	</div>
	<Footer fixed showPrivacyLink={false} />
</div>
