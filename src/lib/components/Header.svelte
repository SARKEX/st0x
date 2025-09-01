<script lang="ts">
	import TickerTape from './TickerTape.svelte';
	import WalletConnect from './WalletConnect.svelte';
	import NetworkSelector from './NetworkSelector.svelte';
	import { goto } from '$app/navigation';
	import { createEventDispatcher } from 'svelte';

	export let title: string;
	export let description: string;
	
	const dispatch = createEventDispatcher();
	
	function openMobileMenu() {
		dispatch('openMenu');
	}
</script>

<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 backdrop-blur-lg">
	<TickerTape />
	<div class="px-4 py-1 sm:px-6 sm:py-2">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
			<div class="flex items-center gap-3 sm:gap-4">
				<button
					on:click={openMobileMenu}
					class="p-2 rounded-lg hover:bg-white/10 transition-colors lg:hidden"
					aria-label="Open menu"
				>
					<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
						<path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path>
					</svg>
				</button>
				<div>
					<h1 class="text-base font-bold sm:text-lg">{title}</h1>
					<p class="text-xs text-gray-400">{description}</p>
				</div>
			</div>

			<div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
				<NetworkSelector />
				<button
					class="hidden w-full rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-4 py-3 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105 sm:inline-flex sm:w-auto sm:px-5 sm:py-2.5"
					on:click={() => goto('/trade-list')}
				>
					Trade Now
				</button>
				<WalletConnect />
			</div>
		</div>
	</div>
</div>
