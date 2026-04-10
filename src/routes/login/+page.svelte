<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in — Group Booking</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gray-50 px-4">
	<div class="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
		<h1 class="mb-6 text-2xl font-semibold">Researcher sign-in</h1>
		<form method="post" use:enhance class="space-y-4">
			<input type="hidden" name="next" value={data.next} />
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Email</span>
				<input
					type="email"
					name="email"
					autocomplete="email"
					required
					value={form?.email ?? ''}
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-gray-700">Password</span>
				<input
					type="password"
					name="password"
					autocomplete="current-password"
					required
					class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:ring-2 focus:ring-gray-900 focus:outline-none"
				/>
			</label>
			{#if form?.error}
				<p class="text-sm text-red-600">{form.error}</p>
			{/if}
			<button
				type="submit"
				class="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
			>
				Sign in
			</button>
		</form>
		<p class="mt-4 text-xs text-gray-500">
			No self-service signup. Admin is created via <code>pnpm seed:admin</code>.
		</p>
	</div>
</div>
