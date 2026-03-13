<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import { networks } from '$lib/config/network';
	import { switchChain } from '@wagmi/core';
	import { wagmiConfig, chainId, connected } from 'svelte-wagmi';
	import { get } from 'svelte/store';
	import { track } from '$lib/services/analytics';

	let isOpen = false;

	function getChainLogo(n: (typeof networks)[0]): string {
		if (!n) return '/images/ETH.svg';
		switch (n.chainId) {
			case 42161:
				return '/images/ARB.svg';
			case 8453:
				return '/images/BASE.svg';
			default:
				return '/images/ETH.svg';
		}
	}

	async function selectNetwork(network: (typeof networks)[0]) {
		const previousNetwork = $currentNetwork;

		$currentNetwork = network;
		isOpen = false;

		// If wallet is connected and on a different network, prompt to switch
		if ($connected && $chainId && $chainId !== network.id) {
			track('network_switch_initiated', {
				from_network: previousNetwork?.displayName,
				to_network: network.displayName,
				from_chain_id: previousNetwork?.chainId,
				to_chain_id: network.chainId
			});

			try {
				await switchChain(get(wagmiConfig), { chainId: network.id });
				track('network_switched', {
					from_network: previousNetwork?.displayName,
					to_network: network.displayName,
					from_chain_id: previousNetwork?.chainId,
					to_chain_id: network.chainId
				});
			} catch (error) {
				track('network_switch_failed', {
					from_network: previousNetwork?.displayName,
					to_network: network.displayName,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		} else {
			// No wallet chain switch needed, just track the UI selection
			track('network_switched', {
				from_network: previousNetwork?.displayName,
				to_network: network.displayName,
				from_chain_id: previousNetwork?.chainId,
				to_chain_id: network.chainId
			});
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
		if (isOpen) {
			track('network_selector_opened', {
				current_network: $currentNetwork?.displayName
			});
		}
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

<div class="network-selector relative z-[10000] inline-block shrink-0">
	<button
		on:click={toggleDropdown}
		class="flex min-h-10 items-center gap-2 rounded-lg bg-transparent px-2 py-1 text-xs font-medium text-white transition-all duration-200 hover:bg-white/5 active:scale-95 sm:px-3 sm:py-2 sm:text-sm"
	>
		<div class="flex items-center gap-2">
			<img
				src={getChainLogo($currentNetwork)}
				alt={$currentNetwork.displayName}
				class="h-4 w-4"
				class:rounded-full={$currentNetwork.chainId !== 8453}
			/>
			<span class="hidden sm:inline">{$currentNetwork.displayName}</span>
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
							? 'bg-brand-gold-500/20'
							: ''}"
					>
						<img
							src={getChainLogo(network)}
							alt={network.displayName}
							class="h-4 w-4"
							class:rounded-full={network.chainId !== 8453}
						/>
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
