<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import { networks } from '$lib/network';
	import { switchChain } from '@wagmi/core';
	import { wagmiConfig, chainId, connected } from 'svelte-wagmi';
	import { get } from 'svelte/store';

	let isOpen = false;

	async function selectNetwork(network: (typeof networks)[0]) {
		$currentNetwork = network;
		isOpen = false;

		// If wallet is connected and on a different network, prompt to switch
		if ($connected && $chainId && $chainId !== network.id) {
			await switchChain(get(wagmiConfig), { chainId: network.id });
		}
	}

	// Auto-trigger network switch when currentNetwork changes from other parts of the app
	$: if ($currentNetwork && $connected && $chainId && $chainId !== $currentNetwork.id) {
		// Small delay to avoid immediate switching during initial load
		setTimeout(async () => {
			await switchChain(get(wagmiConfig), { chainId: $currentNetwork.id });
		}, 100);
	}

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.network-selector')) {
			isOpen = false;
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="network-selector relative">
	<button
		on:click={toggleDropdown}
		class="flex items-center gap-2 rounded-lg border border-white/10 bg-gray-700/80 px-3 py-2 text-sm font-medium text-white transition-all duration-200 hover:border-yellow-500/30 hover:bg-gray-600/80 active:scale-95"
	>
		<div class="flex items-center gap-2">
			<div class="h-4 w-4 rounded-full bg-gradient-to-r from-blue-500 to-purple-600"></div>
			<span class="hidden sm:inline">{$currentNetwork.displayName}</span>
			<span class="sm:hidden">{$currentNetwork.displayName.split(' ')[0]}</span>
		</div>
		<span class="text-xs transition-transform duration-200" class:rotate-180={isOpen}>▼</span>
	</button>

	{#if isOpen}
		<!-- Mobile overlay for better touch interaction -->
		<div
			class="fixed inset-0 z-[9998] bg-black/20 sm:hidden"
			on:click={() => (isOpen = false)}
			on:keydown={(e) => e.key === 'Escape' && (isOpen = false)}
			role="button"
			tabindex="0"
		></div>

		<!-- Dropdown content - responsive positioning -->
		<div
			class="absolute left-0 right-0 top-full z-[9999] mx-2 mt-1 min-w-[200px] rounded-lg border border-white/10 bg-gray-800/95 shadow-lg backdrop-blur-lg sm:left-auto sm:right-0 sm:top-full sm:mx-0 sm:w-auto"
		>
			<div class="p-1">
				{#each networks as network}
					<button
						on:click={() => selectNetwork(network)}
						class="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-white transition-colors hover:bg-gray-700/80 active:bg-gray-600/80 {$currentNetwork.id ===
						network.id
							? 'bg-yellow-500/20'
							: ''}"
					>
						<div class="h-3 w-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-600"></div>
						<div class="flex flex-col items-start">
							<span class="font-medium">{network.displayName}</span>
							<span class="text-xs text-gray-400">{network.currencySymbol}</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
