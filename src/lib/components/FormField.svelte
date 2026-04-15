<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		error,
		hint,
		class: klass = '',
		children
	}: {
		label: string;
		error?: string;
		hint?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<label class="block {klass}">
	<span class="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
	{@render children()}
	{#if error}
		<p class="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
	{/if}
	{#if hint}
		<p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p>
	{/if}
</label>
