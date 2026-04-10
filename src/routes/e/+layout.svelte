<script lang="ts">
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children } = $props();
</script>

<div class="relative min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
	<div class="fixed top-3 right-3 z-50">
		<ThemeToggle />
	</div>
	{@render children()}
</div>
