<script lang="ts">
	import { resolve } from '$app/paths';

	let { fixed = false, showPrivacyLink = true }: { fixed?: boolean; showPrivacyLink?: boolean } =
		$props();
</script>

<footer
	class="{fixed
		? 'fixed bottom-0 left-0 w-full'
		: ''} mt-12 mb-0 pb-4 text-center text-sm text-gray-500 dark:text-gray-400"
>
	<p>
		&copy; {new Date().getFullYear()}
		<a href="https://zeyus.com/" target="_blank" rel="noopener noreferrer">zeyus</a>. Licenced under
		the
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
		{#if showPrivacyLink}
			<a class="underline" href={resolve('/privacy')}>Privacy Policy</a>.
		{/if}
	</p>
</footer>
