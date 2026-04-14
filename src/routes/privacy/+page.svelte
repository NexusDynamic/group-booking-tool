<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Privacy Policy — Group Booking</title>
</svelte:head>

<div class="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
	<main class="mx-auto max-w-2xl px-6 py-12">
		<a
			href="/"
			class="text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
			>← Back</a
		>

		<h1 class="mt-4 text-3xl font-semibold">Privacy Policy</h1>
		<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
			Last updated: {new Date().getFullYear()}
		</p>

		<div class="mt-8 space-y-8 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
			<!-- 1. Data controller -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
					1. Data controller
				</h2>
				{#if data.controllerName || data.controllerEmail}
					<p class="mt-2">
						The data controller responsible for the personal data collected through this booking
						system is:
					</p>
					<p class="mt-2">
						{#if data.controllerName}<strong>{data.controllerName}</strong>{/if}
						{#if data.controllerEmail}
							{#if data.controllerName} — {/if}
							<a
								href="mailto:{data.controllerEmail}"
								class="underline hover:text-gray-900 dark:hover:text-gray-100"
								>{data.controllerEmail}</a
							>
						{/if}
					</p>
					<p class="mt-2">
						To exercise your rights or ask any privacy-related question, contact the data controller
						at the address above.
					</p>
				{:else}
					<p class="mt-2">
						The data controller is the researcher or organisation that operates this booking system.
						Contact them directly for any privacy-related requests.
					</p>
				{/if}
			</section>

			<!-- 2. What data we collect -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
					2. What personal data we collect
				</h2>
				<p class="mt-2">
					When you sign up for a research session we collect the following information:
				</p>
				<ul class="mt-2 list-disc pl-5 space-y-1">
					<li><strong>Name</strong> — to identify you as a participant.</li>
					<li>
						<strong>Email address</strong> — to allow the researcher to contact you and to prevent
						duplicate bookings.
					</li>
					<li>
						<strong>Experiment-specific fields</strong> — any additional information the researcher
						requires (e.g. age group, student status). These vary per experiment and are described on
						the sign-up form.
					</li>
				</ul>
				<p class="mt-2">
					We do <strong>not</strong> collect payment information, government identifiers, or any other
					sensitive personal data beyond what is listed above.
				</p>
			</section>

			<!-- 3. Purpose and lawful basis -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
					3. Why we process your data (purpose and lawful basis)
				</h2>
				<p class="mt-2">
					Your data is processed solely to manage your participation in a research session: to
					confirm your booking, to allow the researcher to contact you about the session, and to
					prevent duplicate or ineligible registrations.
				</p>
				<p class="mt-2">
					The lawful basis for this processing is <strong>legitimate interests</strong> (Article 6(1)(f)
					GDPR). The researcher has a legitimate interest in organising research sessions and ensuring
					that booked participants can be contacted and confirmed. This processing is necessary and
					proportionate to that interest.
				</p>
			</section>

			<!-- 4. Data retention -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">4. Data retention</h2>
				<p class="mt-2">
					Your personal data is retained only for as long as necessary to manage your booking. Once
					an experiment has concluded, your data is automatically anonymised within
					<strong>{data.retentionDays} days</strong>. Individual experiments may apply a shorter or
					longer retention period; where this differs it will be stated on the sign-up form.
				</p>
				<p class="mt-2">
					After anonymisation, your name, email address, and any other personal fields are replaced
					with a non-identifiable placeholder. Anonymised records may be retained for statistical
					purposes (e.g. session attendance counts).
				</p>
			</section>

			<!-- 5. Your rights -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
					5. Your rights under GDPR
				</h2>
				<p class="mt-2">You have the following rights regarding your personal data:</p>
				<ul class="mt-2 list-disc pl-5 space-y-1">
					<li>
						<strong>Right of access (Art. 15)</strong> — you may request a copy of the personal data
						held about you.
					</li>
					<li>
						<strong>Right to rectification (Art. 16)</strong> — you may ask us to correct inaccurate
						data.
					</li>
					<li>
						<strong>Right to erasure (Art. 17)</strong> — you may request deletion of your data
						before the scheduled anonymisation date.
					</li>
					<li>
						<strong>Right to restriction (Art. 18)</strong> — you may request that we limit how we
						process your data.
					</li>
					<li>
						<strong>Right to data portability (Art. 20)</strong> — you may request your data in a
						structured, machine-readable format.
					</li>
					<li>
						<strong>Right to object (Art. 21)</strong> — you may object to processing based on
						legitimate interests.
					</li>
				</ul>
				<p class="mt-2">
					To exercise any of these rights, please contact the data controller
					{#if data.controllerEmail}
						at <a
							href="mailto:{data.controllerEmail}"
							class="underline hover:text-gray-900 dark:hover:text-gray-100"
							>{data.controllerEmail}</a
						>
					{:else}
						using the contact details provided in the experiment sign-up form
					{/if}.
					We will respond within 30 days.
				</p>
				<p class="mt-2">
					You also have the right to lodge a complaint with your national data protection authority
					if you believe your rights have been infringed.
				</p>
			</section>

			<!-- 6. Cookies -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">6. Cookies</h2>
				<p class="mt-2">
					This website uses <strong>strictly necessary session cookies</strong> only. These cookies
					are used exclusively for the administrator login and are not used to track participants.
					No analytics, advertising, or third-party tracking cookies are set.
				</p>
				<p class="mt-2">
					Because only strictly necessary cookies are used, no cookie consent banner is displayed.
				</p>
			</section>

			<!-- 7. Data security and storage -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
					7. Data security and storage location
				</h2>
				<p class="mt-2">
					All data is stored locally on the server operated by the data controller. We do not
					share, sell, or transfer your personal data to third parties. No international data
					transfers take place.
				</p>
				<p class="mt-2">
					The server uses HTTPS to encrypt data in transit. Access to the admin interface is
					password-protected.
				</p>
			</section>

			<!-- 8. No automated decision-making -->
			<section>
				<h2 class="text-base font-semibold text-gray-900 dark:text-gray-100">
					8. Automated decision-making
				</h2>
				<p class="mt-2">
					No automated decision-making or profiling (as defined in Article 22 GDPR) takes place.
					All booking decisions are made by the researcher.
				</p>
			</section>
		</div>
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
		</p>
	</footer>
</div>
