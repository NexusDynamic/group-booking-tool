<script lang="ts">
	import type { Snippet } from 'svelte';

	type Variant = 'success' | 'error' | 'warning';

	let {
		variant = 'success',
		class: klass = 'mt-4',
		children
	}: { variant?: Variant; class?: string; children: Snippet } = $props();

	const styles: Record<Variant, string> = {
		success: 'bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300',
		error: 'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300',
		warning: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
	};
</script>

<p class="rounded-md p-3 text-sm {styles[variant]} {klass}">
	{@render children()}
</p>
