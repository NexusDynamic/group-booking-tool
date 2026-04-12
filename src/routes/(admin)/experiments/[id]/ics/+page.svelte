<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import ExperimentNav from '$lib/components/ExperimentNav.svelte';
	import Alert from '$lib/components/Alert.svelte';
	import Card from '$lib/components/Card.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let exp = $derived(data.experiment);

	let copied = $state<'public' | 'researcher' | null>(null);

	async function copy(which: 'public' | 'researcher') {
		const url = which === 'public' ? data.publicUrl : data.researcherUrl;
		await navigator.clipboard.writeText(url);
		copied = which;
		setTimeout(() => (copied = null), 2000);
	}
</script>

<svelte:head>
	<title>ICS feeds — {exp.name}</title>
</svelte:head>

<a
	href={`/experiments/${exp.id}`}
	class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
	>← {exp.name}</a
>
<h1 class="mt-1 text-2xl font-semibold">Calendar feeds</h1>
<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
	Subscribe from Apple Calendar, Google Calendar, Fantastical, etc. Each event title includes a live
	booking count so you can see fill state at a glance.
</p>

<ExperimentNav />

{#if form?.rotated}
	<Alert variant="warning">
		{form.rotated === 'public' ? 'Public' : 'Researcher'} feed token rotated. Any existing subscribers
		need to re-subscribe.
	</Alert>
{/if}

<section class="mt-8 space-y-6">
	<Card class="p-4">
		<h2 class="font-semibold">Public feed</h2>
		<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
			Share this URL with stakeholders who need to see booking progress. Each event's title shows
			<code class="rounded bg-gray-100 px-1 dark:bg-gray-800">(n/cap)</code>.
		</p>
		<div class="mt-3 flex gap-2">
			<input
				readonly
				value={data.publicUrl}
				class="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<button
				type="button"
				onclick={() => copy('public')}
				class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
				>{copied === 'public' ? 'Copied' : 'Copy'}</button
			>
		</div>
		<form method="post" action="?/rotatePublic" use:enhance class="mt-3">
			<button
				type="submit"
				class="text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
				onclick={(e) => {
					if (!confirm('Rotate the public feed URL? Existing subscribers will break.'))
						e.preventDefault();
				}}>Rotate token</button
			>
		</form>
	</Card>

	<Card class="p-4">
		<h2 class="font-semibold">Researcher feed</h2>
		<p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
			Private URL — treat this like a password. Includes reminder events from your reminder rules.
		</p>
		<div class="mt-3 flex gap-2">
			<input
				readonly
				value={data.researcherUrl}
				class="flex-1 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
			/>
			<button
				type="button"
				onclick={() => copy('researcher')}
				class="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
				>{copied === 'researcher' ? 'Copied' : 'Copy'}</button
			>
		</div>
		<form method="post" action="?/rotateResearcher" use:enhance class="mt-3">
			<button
				type="submit"
				class="text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
				onclick={(e) => {
					if (!confirm('Rotate the researcher feed URL? You will need to re-subscribe.'))
						e.preventDefault();
				}}>Rotate token</button
			>
		</form>
	</Card>
</section>
