<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	// Note: With the React SDK, Privy handles authentication directly in its modal.
	// This callback page is kept for potential OAuth redirect flows but in most cases
	// users won't land here as the Privy modal handles everything client-side.

	let error: string | null = null;

	onMount(async () => {
		// If user lands here from an OAuth redirect, just redirect them home
		// The Privy SDK will restore their session automatically
		const params = $page.url.searchParams;
		const redirectTo = params.get('redirect') || '/';

		// Small delay to show loading state
		setTimeout(() => {
			goto(redirectTo);
		}, 500);
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-900">
	<div class="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
		{#if error}
			<div class="flex flex-col items-center gap-4">
				<div class="rounded-full bg-red-500/20 p-4">
					<svg class="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</div>
				<p class="text-red-400">{error}</p>
				<a
					href="/"
					class="mt-4 rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-4 py-2 text-white hover:opacity-90"
				>
					Return Home
				</a>
			</div>
		{:else}
			<div class="flex flex-col items-center gap-4">
				<LoadingSpinner />
				<p class="text-gray-300">Completing authentication...</p>
			</div>
		{/if}
	</div>
</div>
