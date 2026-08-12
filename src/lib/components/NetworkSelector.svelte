<script lang="ts">
	import { availableNetworks, currentNetwork } from '$lib/stores';
	import type { Network } from '$lib/config/network';
	import { switchChain } from '@wagmi/core';
	import { wagmiConfig, chainId, connected } from 'svelte-wagmi';
	import { track } from '$lib/services/analytics';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { onDestroy } from 'svelte';

	let isOpen = false;
	let pendingSwitchTimer: ReturnType<typeof setTimeout> | null = null;

	function selectNetwork(network: Network) {
		$currentNetwork = network;
		isOpen = false;
	}

	function scheduleWalletSwitch(
		network: Network | null,
		isConnected: boolean,
		walletChainId: number | null | undefined,
		config: Parameters<typeof switchChain>[0] | undefined
	) {
		if (pendingSwitchTimer) {
			clearTimeout(pendingSwitchTimer);
			pendingSwitchTimer = null;
		}
		if (!network || !isConnected || !walletChainId || !config || walletChainId === network.id) {
			return;
		}

		track('network_switch_initiated', {
			to_network: network.displayName,
			from_chain_id: walletChainId,
			to_chain_id: network.chainId
		});
		pendingSwitchTimer = setTimeout(async () => {
			pendingSwitchTimer = null;
			try {
				await switchChain(config, { chainId: network.id });
				track('network_switched', {
					to_network: network.displayName,
					from_chain_id: walletChainId,
					to_chain_id: network.chainId
				});
			} catch (error) {
				track('network_switch_failed', {
					to_network: network.displayName,
					from_chain_id: walletChainId,
					to_chain_id: network.chainId,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}, 100);
	}

	$: scheduleWalletSwitch($currentNetwork, $connected, $chainId, $wagmiConfig);

	onDestroy(() => {
		if (pendingSwitchTimer) clearTimeout(pendingSwitchTimer);
	});

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
		class="flex items-center gap-1.5 rounded-lg border border-line bg-overlay-1 px-2.5 py-1.5 text-sm font-medium text-text-2 transition-all duration-200 hover:bg-overlay-hover active:scale-95"
	>
		<span class="h-2 w-2 rounded-full bg-iris-500"></span>
		<span class="hidden capitalize sm:inline">{$currentNetwork?.name ?? 'Network'}</span>
		<Icon
			name="chevronDown"
			className="h-4 w-4 text-text-3 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
		/>
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
			class="bg-surface-1/95 absolute left-0 right-0 top-full z-[9999] mx-2 mt-1 min-w-[200px] rounded-lg border border-line shadow-[var(--shadow-2)] backdrop-blur-lg sm:left-auto sm:right-0 sm:top-full sm:mx-0 sm:w-auto"
		>
			<div class="p-1">
				{#each $availableNetworks as network}
					<button
						on:click={() => selectNetwork(network)}
						class="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-text transition-colors hover:bg-surface-2 active:bg-surface-3 {$currentNetwork?.id ===
						network.id
							? 'bg-accent-soft'
							: ''}"
					>
						{#if network.icon.startsWith('/')}
							<img src={network.icon} alt={network.displayName} class="h-4 w-4 rounded-full" />
						{:else}
							<Icon name="blocks" className="h-4 w-4 text-text-3" />
						{/if}
						<div class="flex flex-col items-start">
							<span class="font-medium">{network.displayName}</span>
							<span class="text-xs text-text-3">{network.currencySymbol}</span>
						</div>
					</button>
				{/each}
			</div>
		</div>
	{/if}
</div>
