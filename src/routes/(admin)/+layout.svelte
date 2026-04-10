<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/experiments', label: 'Experiments' },
		{ href: '/participants', label: 'Participants' },
		{ href: '/account', label: 'Account' }
	];

	function isActive(href: string): boolean {
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<div class="min-h-screen bg-gray-50 text-gray-900">
	<header class="border-b border-gray-200 bg-white">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
			<a href="/dashboard" class="text-lg font-semibold">Group Booking</a>
			<nav class="flex items-center gap-1">
				{#each navItems as item (item.href)}
					<a
						href={item.href}
						class="rounded-md px-3 py-1.5 text-sm font-medium transition {isActive(item.href)
							? 'bg-gray-900 text-white'
							: 'text-gray-700 hover:bg-gray-100'}"
					>
						{item.label}
					</a>
				{/each}
				<form method="post" action="/logout" class="ml-2">
					<button
						type="submit"
						class="rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
					>
						Sign out
					</button>
				</form>
			</nav>
		</div>
		<div class="mx-auto max-w-6xl px-6 pb-2 text-xs text-gray-500">
			Signed in as <span class="font-medium">{data.user.email}</span>
		</div>
	</header>
	<main class="mx-auto max-w-6xl px-6 py-8">
		{@render children()}
	</main>
</div>
