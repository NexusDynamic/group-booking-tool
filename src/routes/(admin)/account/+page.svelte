<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Account — Group Booking</title>
</svelte:head>

<h1 class="text-2xl font-semibold">Account</h1>

<section class="mt-6 max-w-md rounded-lg border border-gray-200 bg-white p-5">
	<dl class="space-y-2 text-sm">
		<div class="flex justify-between">
			<dt class="text-gray-500">Name</dt>
			<dd class="font-medium text-gray-900">{data.user.name}</dd>
		</div>
		<div class="flex justify-between">
			<dt class="text-gray-500">Email</dt>
			<dd class="font-mono text-xs text-gray-900">{data.user.email}</dd>
		</div>
	</dl>
</section>

<section class="mt-8 max-w-md">
	<h2 class="text-lg font-semibold">Change password</h2>

	{#if form?.changed}
		<p class="mt-3 rounded-md bg-green-50 p-3 text-sm text-green-800">Password updated.</p>
	{/if}
	{#if form?.errors?._}
		<p class="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{form.errors._}</p>
	{/if}

	<form method="post" action="?/changePassword" use:enhance class="mt-4 space-y-4">
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Current password</span>
			<input
				type="password"
				name="currentPassword"
				required
				autocomplete="current-password"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
			{#if form?.errors?.currentPassword}
				<span class="mt-1 block text-xs text-red-700">{form.errors.currentPassword}</span>
			{/if}
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">New password</span>
			<input
				type="password"
				name="newPassword"
				required
				minlength="8"
				autocomplete="new-password"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
			{#if form?.errors?.newPassword}
				<span class="mt-1 block text-xs text-red-700">{form.errors.newPassword}</span>
			{/if}
		</label>
		<label class="block">
			<span class="text-sm font-medium text-gray-700">Confirm new password</span>
			<input
				type="password"
				name="confirmPassword"
				required
				autocomplete="new-password"
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
			{#if form?.errors?.confirmPassword}
				<span class="mt-1 block text-xs text-red-700">{form.errors.confirmPassword}</span>
			{/if}
		</label>
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
			>Change password</button
		>
	</form>
</section>
