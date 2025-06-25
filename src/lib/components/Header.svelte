<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { goto } from '$app/navigation';

	export let title: string;
	export let description: string;

	// Mobile menu state
	let mobileMenuOpen = false;
	function toggleMenu() { mobileMenuOpen = !mobileMenuOpen; }

</script>

<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-lg">
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
		<div class="flex items-center gap-3 sm:gap-4">
			<!-- Hamburger button (mobile only) -->
			<button class="sm:hidden text-2xl text-white mr-2" aria-label="Open menu" on:click={toggleMenu}>☰</button>
			<div>
				<h1 class="text-lg sm:text-xl font-bold">{title}</h1>
				<p class="text-xs sm:text-sm text-gray-400">{description}</p>
			</div>
		</div>

		<div class="flex items-center gap-2 sm:gap-4">
			<button
				class="rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-white transition-transform hover:scale-105"
				on:click={() => goto('/neworder')}
			>
				Trade now
			</button>
			<WalletConnect />
		</div>
	</div>
</div>
