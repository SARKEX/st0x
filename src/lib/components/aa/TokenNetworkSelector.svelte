<script lang="ts">
	/**
	 * Token & Network Selector Component
	 *
	 * Shows all payment tokens across all networks in a single dropdown.
	 * Highlights networks where user has balances with dividers.
	 */
	import { createEventDispatcher, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		type PaymentToken,
		type SupportedNetworkId,
		SUPPORTED_NETWORKS,
		NETWORK_NAMES,
		getPaymentTokensForNetwork,
		USDC_BASE
	} from '$lib/services/account-abstraction';
	import { aaPaymentStore } from '$lib/stores/aaPaymentStore';
	import { createQuery } from '@tanstack/svelte-query';
	import { wagmiConfig } from 'svelte-wagmi';
	import { walletAddress, isAuthenticated } from '$lib/stores/authStore';
	import {
		fetchAllTokenBalances,
		getBalanceQueryKey,
		BALANCE_QUERY_OPTIONS,
		getTokenBalance as getTokenBalanceFromStore,
		type TokenBalance
	} from '$lib/stores/balanceStore';

	// Props
	export let selectedToken: PaymentToken | null = null;
	export let disabled: boolean = false;
	export let showNetworkWarning: boolean = true;
	export let syncWithStore: boolean = true;

	const dispatch = createEventDispatcher<{
		select: { token: PaymentToken };
		change: { token: PaymentToken };
	}>();

	// Initialize with USDC on Base if no token selected
	onMount(() => {
		if (!selectedToken && syncWithStore) {
			selectedToken = USDC_BASE;
			aaPaymentStore.setSourceToken(USDC_BASE);
		}
	});

	// State
	let isOpen = false;

	// Available networks
	const availableNetworks: SupportedNetworkId[] = [
		SUPPORTED_NETWORKS.BASE,
		SUPPORTED_NETWORKS.ARBITRUM,
		SUPPORTED_NETWORKS.OPTIMISM,
		SUPPORTED_NETWORKS.ETHEREUM
	];

	// Helper to check if token has non-zero balance
	function hasNonZeroBalance(token: PaymentToken, balances: TokenBalance[]): boolean {
		const match = balances.find(
			(b) =>
				b?.token?.address?.toLowerCase() === token.address.toLowerCase() &&
				b?.token?.chainId === token.chainId
		);
		return match ? match.balance > 0n : false;
	}

	// Filter tokens to only show those with non-zero balances
	$: allNetworkTokens = availableNetworks
		.map((network) => {
			const tokens = getPaymentTokensForNetwork(network);
			const tokenBalances = $tokenBalancesQuery?.data ?? [];

			// If balances haven't loaded yet, show all tokens
			const hasLoadedBalances = tokenBalances.length > 0;

			const filteredTokens = hasLoadedBalances
				? tokens.filter((token) => hasNonZeroBalance(token, tokenBalances))
				: tokens;

			return {
				network,
				networkName: NETWORK_NAMES[network] || `Chain ${network}`,
				tokens: filteredTokens,
				totalBalance: 0
			};
		})
		// Filter out networks with no tokens
		.filter((networkGroup) => networkGroup.tokens.length > 0);

	// Use centralized balance store (shared with Dashboard and NetworkSelector)
	// Shares cache with other components, so no additional RPC calls
	$: tokenBalancesQuery = createQuery({
		queryKey: getBalanceQueryKey($walletAddress),
		enabled: browser && !!($isAuthenticated && $walletAddress && $wagmiConfig),
		...BALANCE_QUERY_OPTIONS,
		queryFn: async () => {
			if (!$walletAddress || !$wagmiConfig) return [];

			// Fetch all balances once using centralized store
			return await fetchAllTokenBalances($walletAddress as `0x${string}`, $wagmiConfig);
		}
	});

	// Helper to get token balance info
	function getTokenBalanceInfo(token: PaymentToken): { formatted: number; isStablecoin: boolean } {
		try {
			const tokenBalances = $tokenBalancesQuery?.data ?? [];
			const balance = getTokenBalanceFromStore(tokenBalances, token.address, token.chainId);
			const isStablecoin = token.symbol === 'USDC' || token.symbol === 'USDT';
			return {
				formatted: balance?.balanceFormatted ?? 0,
				isStablecoin
			};
		} catch (error) {
			console.error('[TokenNetworkSelector] Error getting token balance:', error);
			return { formatted: 0, isStablecoin: false };
		}
	}

	// Check if selection requires cross-chain swap
	$: requiresCrossChainSwap = selectedToken && selectedToken.chainId !== SUPPORTED_NETWORKS.BASE;
	$: requiresTokenSwap = selectedToken && selectedToken.symbol !== 'USDC';

	function getNetworkName(chainId: number): string {
		return NETWORK_NAMES[chainId as SupportedNetworkId] || `Chain ${chainId}`;
	}

	function selectToken(token: PaymentToken) {
		selectedToken = token;
		if (syncWithStore) {
			aaPaymentStore.setSourceToken(token);
		}
		dispatch('select', { token });
		dispatch('change', { token });
		isOpen = false;
	}

	function toggleDropdown(event: MouseEvent) {
		if (!disabled) {
			event.stopPropagation(); // Prevent handleClickOutside from immediately closing
			isOpen = !isOpen;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.token-network-selector')) {
			isOpen = false;
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
		<svg class="chevron" class:open={isOpen} width="16" height="16" viewBox="0 0 16 16" fill="none">
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
			<!-- Loading indicator -->
			{#if $tokenBalancesQuery?.isLoading}
				<div class="loading-state">
					<div class="spinner"></div>
					<span>Loading balances...</span>
				</div>
			{:else if allNetworkTokens.length === 0}
				<div class="empty-state">
					<span>No tokens with balance</span>
				</div>
			{/if}

			<!-- Payment Options -->
			{#each allNetworkTokens as { network: _network, networkName, tokens }}
				<div class="network-group">
					<div class="network-label">{networkName}</div>
					{#each tokens as token}
						{@const balanceInfo = getTokenBalanceInfo(token)}
						{@const isSelected =
							selectedToken?.address === token.address && selectedToken?.chainId === token.chainId}
						<button
							type="button"
							class="token-option"
							class:selected={isSelected}
							on:click={() => selectToken(token)}
							role="option"
							aria-selected={isSelected}
						>
							<img src={token.logoUrl} alt={token.symbol} class="token-icon" />
							<div class="token-details">
								<span class="token-name">{token.symbol}</span>
								<span class="token-full-name">{token.name}</span>
							</div>
							{#if balanceInfo.formatted > 0}
								<span class="balance-badge">
									{#if balanceInfo.isStablecoin}
										${balanceInfo.formatted.toFixed(2)}
									{:else}
										{balanceInfo.formatted.toFixed(4)} {token.symbol}
									{/if}
								</span>
							{/if}
							{#if token.symbol !== 'USDC' || token.chainId !== SUPPORTED_NETWORKS.BASE}
								<span class="swap-badge">Swap</span>
							{/if}
						</button>
					{/each}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Cross-Chain Warning -->
	{#if showNetworkWarning && selectedToken && (requiresCrossChainSwap || requiresTokenSwap)}
		<div class="swap-notice">
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
				<path d="M8 14A6 6 0 108 2a6 6 0 000 12z" stroke="currentColor" stroke-width="1.5" />
				<path d="M8 5v3M8 11h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			</svg>
			<span>
				{#if requiresCrossChainSwap && requiresTokenSwap}
					Will swap {selectedToken.symbol} on {getNetworkName(selectedToken.chainId)} → USDC on Base
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
		max-height: 400px;
		overflow-y: auto;
	}

	.network-group {
		margin-bottom: 0.25rem;
	}

	.network-label {
		padding: 0.5rem 1rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--color-text-secondary, #9ca3af);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.token-option {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem 0.75rem 2rem;
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

	.balance-badge {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		background: rgba(16, 185, 129, 0.1);
		color: #10b981;
		border-radius: 0.25rem;
		font-weight: 600;
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

	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 1rem;
		color: var(--color-text-secondary, #9ca3af);
		font-size: 0.875rem;
	}

	.empty-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem 1rem;
		color: var(--color-text-secondary, #9ca3af);
		font-size: 0.875rem;
		text-align: center;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top-color: var(--color-primary, #6366f1);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
