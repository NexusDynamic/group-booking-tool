<script lang="ts">
	import { page } from '$app/state';

	// Reads experiment ID from the route — only valid within /experiments/[id]/** routes.
	let id = $derived(page.params.id);

	let tabs = $derived([
		{ href: `/experiments/${id}`, label: 'Settings' },
		{ href: `/experiments/${id}/fields`, label: 'Required fields' },
		{ href: `/experiments/${id}/templates`, label: 'Recurrence templates' },
		{ href: `/experiments/${id}/sessions`, label: 'Sessions', matchChildren: true },
		{ href: `/experiments/${id}/preferences`, label: 'Preferences' },
		{ href: `/experiments/${id}/reminders`, label: 'Reminders' },
		{ href: `/experiments/${id}/ics`, label: 'ICS' }
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
	{#each tabs as tab}
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
