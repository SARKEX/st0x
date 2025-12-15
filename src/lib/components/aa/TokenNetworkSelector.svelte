<script lang="ts">
	/**
	 * Token & Network Selector Component
	 *
	 * Allows users to select which token and network they want to pay with.
	 * Shows cross-chain swap information when selecting non-USDC tokens or different networks.
	 */
	import { createEventDispatcher } from 'svelte';
	import {
		type PaymentToken,
		type SupportedNetworkId,
		SUPPORTED_NETWORKS,
		NETWORK_NAMES,
		getPaymentTokensForNetwork
	} from '$lib/services/account-abstraction';

	// Props
	export let selectedToken: PaymentToken | null = null;
	export let disabled: boolean = false;
	export let showNetworkWarning: boolean = true;

	const dispatch = createEventDispatcher<{
		select: { token: PaymentToken };
		change: { token: PaymentToken };
	}>();

	// State
	let isOpen = false;
	let selectedNetwork: SupportedNetworkId = SUPPORTED_NETWORKS.BASE;

	// Available networks (mainnet only for now)
	const availableNetworks: SupportedNetworkId[] = [
		SUPPORTED_NETWORKS.BASE,
		SUPPORTED_NETWORKS.ARBITRUM,
		SUPPORTED_NETWORKS.ETHEREUM
	];

	// Get tokens for selected network (exclude native ETH, show only ERC20s)
	$: availableTokens = getPaymentTokensForNetwork(selectedNetwork).filter((t) => !t.isNative);

	// Check if selection requires cross-chain swap
	$: requiresCrossChainSwap =
		selectedToken && selectedToken.chainId !== SUPPORTED_NETWORKS.BASE;

	$: requiresTokenSwap = selectedToken && selectedToken.symbol !== 'USDC';

	// Helper to get network name
	function getNetworkName(chainId: number): string {
		return NETWORK_NAMES[chainId as SupportedNetworkId] || `Chain ${chainId}`;
	}

	function selectNetwork(network: SupportedNetworkId) {
		selectedNetwork = network;
		// Auto-select first token (USDC) when changing network
		const tokens = getPaymentTokensForNetwork(network).filter((t) => !t.isNative);
		if (tokens.length > 0) {
			selectToken(tokens[0]);
		}
	}

	function selectToken(token: PaymentToken) {
		selectedToken = token;
		dispatch('select', { token });
		dispatch('change', { token });
		isOpen = false;
	}

	function toggleDropdown() {
		if (!disabled) {
			isOpen = !isOpen;
		}
	}

	function closeDropdown() {
		isOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.token-network-selector')) {
			closeDropdown();
		}
	}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="token-network-selector" class:disabled>
	<!-- Selected Token Display -->
	<button
		type="button"
		class="selector-button"
		on:click={toggleDropdown}
		{disabled}
		aria-expanded={isOpen}
		aria-haspopup="listbox"
	>
		{#if selectedToken}
			<div class="selected-token">
				<img src={selectedToken.logoUrl} alt={selectedToken.symbol} class="token-icon" />
				<div class="token-info">
					<span class="token-symbol">{selectedToken.symbol}</span>
					<span class="token-network">on {getNetworkName(selectedToken.chainId)}</span>
				</div>
			</div>
		{:else}
			<span class="placeholder">Select token</span>
		{/if}
		<svg
			class="chevron"
			class:open={isOpen}
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
		>
			<path
				d="M4 6L8 10L12 6"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<div class="dropdown" role="listbox">
			<!-- Network Tabs -->
			<div class="network-tabs">
				{#each availableNetworks as network}
					<button
						type="button"
						class="network-tab"
						class:active={selectedNetwork === network}
						on:click={() => selectNetwork(network)}
					>
						{NETWORK_NAMES[network]}
					</button>
				{/each}
			</div>

			<!-- Token List -->
			<div class="token-list">
				{#each availableTokens as token}
					<button
						type="button"
						class="token-option"
						class:selected={selectedToken?.address === token.address &&
							selectedToken?.chainId === token.chainId}
						on:click={() => selectToken(token)}
						role="option"
						aria-selected={selectedToken?.address === token.address}
					>
						<img src={token.logoUrl} alt={token.symbol} class="token-icon" />
						<div class="token-details">
							<span class="token-name">{token.symbol}</span>
							<span class="token-full-name">{token.name}</span>
						</div>
						{#if token.symbol !== 'USDC' || token.chainId !== SUPPORTED_NETWORKS.BASE}
							<span class="swap-badge">Swap</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Cross-Chain Warning -->
	{#if showNetworkWarning && selectedToken && (requiresCrossChainSwap || requiresTokenSwap)}
		<div class="swap-notice">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path
					d="M8 14A6 6 0 108 2a6 6 0 000 12z"
					stroke="currentColor"
					stroke-width="1.5"
				/>
				<path
					d="M8 5v3M8 11h.01"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
				/>
			</svg>
			<span>
				{#if requiresCrossChainSwap && requiresTokenSwap}
					Will swap {selectedToken.symbol} on {getNetworkName(selectedToken.chainId)} → USDC
					on Base
				{:else if requiresCrossChainSwap}
					Will bridge USDC from {getNetworkName(selectedToken.chainId)} to Base
				{:else if requiresTokenSwap}
					Will swap {selectedToken.symbol} → USDC on Base
				{/if}
			</span>
		</div>
	{/if}
</div>

<style>
	.token-network-selector {
		position: relative;
		width: 100%;
	}

	.token-network-selector.disabled {
		opacity: 0.6;
		pointer-events: none;
	}

	.selector-button {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: var(--color-surface, #1a1a2e);
		border: 1px solid var(--color-border, #2d2d44);
		border-radius: 0.5rem;
		color: var(--color-text, #ffffff);
		cursor: pointer;
		transition: border-color 0.2s;
	}

	.selector-button:hover:not(:disabled) {
		border-color: var(--color-primary, #6366f1);
	}

	.selector-button:disabled {
		cursor: not-allowed;
	}

	.selected-token {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.token-icon {
		width: 24px;
		height: 24px;
		border-radius: 50%;
	}

	.token-info {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.token-symbol {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.token-network {
		font-size: 0.75rem;
		color: var(--color-text-secondary, #9ca3af);
	}

	.placeholder {
		color: var(--color-text-secondary, #9ca3af);
	}

	.chevron {
		transition: transform 0.2s;
		color: var(--color-text-secondary, #9ca3af);
	}

	.chevron.open {
		transform: rotate(180deg);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		right: 0;
		background: var(--color-surface, #1a1a2e);
		border: 1px solid var(--color-border, #2d2d44);
		border-radius: 0.5rem;
		overflow: hidden;
		z-index: 50;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
	}

	.network-tabs {
		display: flex;
		border-bottom: 1px solid var(--color-border, #2d2d44);
	}

	.network-tab {
		flex: 1;
		padding: 0.75rem;
		background: none;
		border: none;
		color: var(--color-text-secondary, #9ca3af);
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.network-tab:hover {
		color: var(--color-text, #ffffff);
		background: rgba(255, 255, 255, 0.05);
	}

	.network-tab.active {
		color: var(--color-primary, #6366f1);
		border-bottom: 2px solid var(--color-primary, #6366f1);
		margin-bottom: -1px;
	}

	.token-list {
		max-height: 240px;
		overflow-y: auto;
	}

	.token-option {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: none;
		border: none;
		color: var(--color-text, #ffffff);
		cursor: pointer;
		transition: background 0.2s;
	}

	.token-option:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.token-option.selected {
		background: rgba(99, 102, 241, 0.1);
	}

	.token-details {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.token-name {
		font-weight: 500;
	}

	.token-full-name {
		font-size: 0.75rem;
		color: var(--color-text-secondary, #9ca3af);
	}

	.swap-badge {
		font-size: 0.65rem;
		padding: 0.2rem 0.5rem;
		background: var(--color-primary, #6366f1);
		color: white;
		border-radius: 0.25rem;
		text-transform: uppercase;
		font-weight: 600;
	}

	.swap-notice {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: rgba(99, 102, 241, 0.1);
		border-radius: 0.375rem;
		font-size: 0.75rem;
		color: var(--color-primary, #6366f1);
	}

	.swap-notice svg {
		flex-shrink: 0;
	}
</style>
