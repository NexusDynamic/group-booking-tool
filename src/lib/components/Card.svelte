<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		class: klass = '',
		children
	}: { class?: string; children: Snippet } = $props();
</script>

<div
	class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 {klass}"
>
	{@render children()}
</div>
