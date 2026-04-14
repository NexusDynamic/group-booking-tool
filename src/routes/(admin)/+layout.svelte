<script lang="ts">
	/* eslint svelte/no-navigation-without-resolve: "off" */
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import type { LayoutData } from './$types';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { resolve } from '$app/paths';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const navItems = [
		{ href: resolve('/dashboard'), label: 'Dashboard' },
		{ href: resolve('/experiments'), label: 'Experiments' },
		{ href: resolve('/participants'), label: 'Participants' },
		{ href: resolve('/account'), label: 'Account' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
	<header class="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
			<a href={resolve('/dashboard')} class="text-lg font-semibold">Group Booking</a>
			<nav class="flex items-center gap-1">
				{#each navItems as item (item.href)}
					<a
						href={item.href}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition {isActive(item.href)
							? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
							: 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'}"
					>
						{item.label}
					</a>
				{/each}
				<form method="post" action="/logout" class="ml-2">
					<button
						type="submit"
						class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
					>
						Sign out
					</button>
				</form>
				<div class="ml-1">
					<ThemeToggle />
				</div>
			</nav>
		</div>
		<div class="mx-auto max-w-6xl px-6 pb-2 text-xs text-gray-500 dark:text-gray-400">
			Signed in as <span class="font-medium">{data.user.email}</span>
		</div>
	</header>
	<main class="mx-auto max-w-6xl px-6 py-8">
		{@render children()}
	</main>
	<footer class="mt-12 mb-0 pb-4 text-center text-sm text-gray-500 dark:text-gray-400">
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
			<a class="underline" href="/privacy">Privacy Policy</a>.
		</p>
	</footer>
</div>
