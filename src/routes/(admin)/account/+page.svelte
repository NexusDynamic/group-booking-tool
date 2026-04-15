<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import Alert from '$lib/components/Alert.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import { inputClass } from '$lib/styles';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Account — Group Booking</title>
</svelte:head>

<h1 class="text-2xl font-semibold">Account</h1>

<section
	class="mt-6 max-w-md rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
>
	<dl class="space-y-2 text-sm">
		<div class="flex justify-between">
			<dt class="text-gray-500 dark:text-gray-400">Name</dt>
			<dd class="font-medium text-gray-900 dark:text-gray-100">{data.user.name}</dd>
		</div>
		<div class="flex justify-between">
			<dt class="text-gray-500 dark:text-gray-400">Email</dt>
			<dd class="font-mono text-xs text-gray-900 dark:text-gray-100">{data.user.email}</dd>
		</div>
	</dl>
</section>

<section class="mt-8 max-w-md">
	<h2 class="text-lg font-semibold">Change password</h2>

	{#if form?.changed}
		<Alert variant="success" class="mt-3">Password updated.</Alert>
	{/if}
	{#if form?.errors?._}
		<Alert variant="error" class="mt-3">{form.errors._}</Alert>
	{/if}

	<form method="post" action="?/changePassword" use:enhance class="mt-4 space-y-4">
		<FormField label="Current password" error={form?.errors?.currentPassword}>
			<input
				type="password"
				name="currentPassword"
				required
				autocomplete="current-password"
				class={inputClass}
			/>
		</FormField>
		<FormField label="New password" error={form?.errors?.newPassword}>
			<input
				type="password"
				name="newPassword"
				required
				minlength="8"
				autocomplete="new-password"
				class={inputClass}
			/>
		</FormField>
		<FormField label="Confirm new password" error={form?.errors?.confirmPassword}>
			<input
				type="password"
				name="confirmPassword"
				required
				autocomplete="new-password"
				class={inputClass}
			/>
		</FormField>
		<button
			type="submit"
			class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
			>Change password</button
		>
	</form>
</section>
