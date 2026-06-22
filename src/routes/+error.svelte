<script lang="ts">
	import { page } from '$app/stores';

	// Friendly copy per status. Falls back to a generic message so even a
	// raw SSR failure (500) renders a branded page instead of the platform's
	// bare "500. Internal Error." that Google previously indexed.
	$: status = $page.status;
	$: message =
		status === 404
			? "This page doesn't exist."
			: status >= 500
				? 'Something went wrong on our end. Please try again in a moment.'
				: $page.error?.message ?? 'An unexpected error occurred.';
</script>

<svelte:head>
	<title>{status} · ST0x</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div
	class="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-6 text-center text-white"
>
	<img src="/images/logo-sidebar.svg" alt="ST0x" class="mb-8 h-10 w-auto" />
	<p class="mb-2 text-6xl font-bold text-yellow-400">{status}</p>
	<p class="mb-8 max-w-md text-base text-gray-300">{message}</p>
	<a
		href="/"
		class="rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90"
	>
		Back to home
	</a>
</div>
