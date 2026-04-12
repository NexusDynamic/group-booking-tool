<script lang="ts">
	/* eslint svelte/no-navigation-without-resolve: "off" */
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';

	// Reads experiment ID from the route — only valid within /experiments/[id]/** routes.
	let id = $derived(page.params.id!);
	// Resolved at runtime so hrefs are actual paths (e.g. /experiments/abc123), not route
	// templates. This also satisfies resolve()'s literal-typed route parameter.
	let tabs: { href: ResolvedPathname; label: string; matchChildren?: boolean }[] = $derived([
		{ href: resolve('/(admin)/experiments/[id]', { id }), label: 'Settings' },
		{ href: resolve('/(admin)/experiments/[id]/fields', { id }), label: 'Required fields' },
		{ href: resolve('/(admin)/experiments/[id]/templates', { id }), label: 'Recurrence templates' },
		{
			href: resolve('/(admin)/experiments/[id]/sessions', { id }),
			label: 'Sessions',
			matchChildren: true
		},
		{ href: resolve('/(admin)/experiments/[id]/preferences', { id }), label: 'Preferences' },
		{ href: resolve('/(admin)/experiments/[id]/reminders', { id }), label: 'Reminders' },
		{ href: resolve('/(admin)/experiments/[id]/ics', { id }), label: 'ICS' }
	]);

	function isActive(tab: (typeof tabs)[number]) {
		const p = page.url.pathname;
		if (tab.matchChildren) {
			return p === tab.href || p.startsWith(tab.href + '/');
		}
		// Settings tab href is a prefix of every other tab — require exact match.
		return p === tab.href;
	}
</script>

<nav class="mt-6 flex gap-4 border-b border-gray-200 text-sm dark:border-gray-700">
	{#each tabs as tab (tab.href)}
		{#if isActive(tab)}
			<span class="border-b-2 border-gray-900 pb-2 font-medium dark:border-white">{tab.label}</span>
		{:else}
			<a
				href={tab.href}
				class="pb-2 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
				>{tab.label}</a
			>
		{/if}
	{/each}
</nav>
