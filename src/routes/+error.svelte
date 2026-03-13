<script lang="ts">
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/Button.svelte';
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-900 px-4">
	<div class="text-center">
		<p class="text-6xl font-extrabold tabular-nums text-brand-gold-500">
			{$page.status}
		</p>
		<h1 class="mt-4 text-2xl font-bold text-white sm:text-3xl">
			{#if $page.status === 404}
				Page not found
			{:else}
				Something went wrong
			{/if}
		</h1>
		<p class="mt-3 text-base text-gray-400">
			{#if $page.status === 404}
				The page you're looking for doesn't exist or has been moved.
			{:else if $page.error?.message}
				{$page.error.message}
			{:else}
				An unexpected error occurred. Please try again.
			{/if}
		</p>
		<div class="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
			<a href="/">
				<Button variant="primary">Go home</Button>
			</a>
			<a href="/trade/0x2289249984f1fa2ce86c4e8867e7eb819ea7df95">
				<Button variant="ghost">Visit the trading terminal</Button>
			</a>
		</div>
	</div>
</div>
