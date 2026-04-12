<script lang="ts">
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let { children } = $props();
</script>

<div class="relative min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
	<div class="fixed top-3 right-3 z-50">
		<ThemeToggle />
	</div>
	{@render children()}
	<footer class="mt-12 mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
		<p>
			&copy; {new Date().getFullYear()}
			<a href="https://zeyus.com/" target="_blank" rel="noopener noreferrer">zeyus</a>. Licenced
			under the
			<a
				class="underline"
				href="https://github.com/NexusDynamic/group-booking-tool/blob/main/LICENSE"
				target="_blank"
				rel="noopener noreferrer">MIT License</a
			>.
			<a
				class="underline"
				href="https://github.com/NexusDynamic/group-booking-tool"
				target="_blank"
				rel="noopener noreferrer">Source code</a
			>.
		</p>
	</footer>
</div>
