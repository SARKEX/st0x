<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { wagmiConfig } from 'svelte-wagmi';
	import { isAuthenticated, walletAddress, authMethod } from '$lib/stores/authStore';
	import {
		openSendFundsModal,
		openDepositModal,
		exportPrivyWallet,
		type SendModalToken
	} from '$lib/stores/privyStore';
	import { currentNetwork, sfts } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { truncateAddress } from '$lib/utils/format';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits, erc20Abi } from 'viem';
	import { readContract, getBalance } from '@wagmi/core';
	import { getAllTokensByNetwork } from '$lib/config/network';
	import { TOKENS, PAYMENT_TOKENS_BY_NETWORK } from '$lib/config/tokens';
	import { goto } from '$app/navigation';
	import type { SgTrade } from '@rainlanguage/orderbook';
	import Table from '$lib/components/ui/table/Table.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { findQuoteForSymbol } from '$lib/utils/tradingViewSymbols';
	import { parseFloatHex, getRaindexVaultUrl } from '$lib/utils/tokenMath';
	import { createPriceFeedsQuery } from '$lib/queries/priceFeeds';
	import { createOrderbookQuotesQuery } from '$lib/queries/orderbook';
	import { createUserVaultsQuery } from '$lib/queries/vaults';
	import { createTradeActivityQuery } from '$lib/queries/tradeActivity';
	import transactionStore from '$lib/stores/transaction';
	import OrdersTable from '$lib/components/orders/OrdersTable.svelte';
	import type { DisplayOrder } from '$lib/types/orders';
	import { transformTradeToDisplayOrder } from '$lib/utils/tradeTransform';
	import { addTokenToWallet } from '$lib/utils/walletUtils';

	// Default vault ID (0x1 padded to 32 bytes)
	const DEFAULT_VAULT_ID = '0x0000000000000000000000000000000000000000000000000000000000000001';

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Set of valid token addresses (asset tokens + payment tokens) for filtering
	$: validTokenAddresses = (() => {
		if (!$currentNetwork) return new Set<string>();
		const addresses = new Set<string>();
		// Add asset tokens for current network
		for (const token of TOKENS) {
			if (token.chainId === $currentNetwork.chainId) {
				addresses.add(token.address.toLowerCase());
			}
		}
		// Add payment tokens for current network
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork.chainId] ?? [];
		for (const token of paymentTokens) {
			addresses.add(token.address.toLowerCase());
		}
		return addresses;
	})();

	let isNetworkLoading = false;
	const BASE_TABS = [
		{ id: 'portfolio', label: 'Portfolio' },
		{ id: 'orders', label: 'Orders' },
		{ id: 'vaults', label: 'Vaults' }
	];
	const WALLET_TAB = { id: 'wallet', label: 'Wallet Management' };

	// Add Wallet Management tab for Privy users
	$: DASHBOARD_TABS = $authMethod === 'privy' ? [...BASE_TABS, WALLET_TAB] : BASE_TABS;

	type DashboardTabId = 'portfolio' | 'orders' | 'vaults' | 'wallet';
	let activeTab: DashboardTabId = 'portfolio';

	const handleDashboardTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (DASHBOARD_TABS.some((tab) => tab.id === nextId)) {
			activeTab = nextId as DashboardTabId;
		}
	};

	// Helper to open send modal with a specific token
	function handleWithdraw(holding: {
		symbol: string;
		address: string;
		decimals: number;
		walletBalance: bigint;
		walletBalanceNum: number;
	}) {
		const token: SendModalToken = {
			symbol: holding.symbol,
			address: holding.address,
			decimals: holding.decimals,
			balance: holding.walletBalanceNum.toFixed(holding.decimals === 6 ? 2 : 4),
			balanceRaw: holding.walletBalance
		};
		openSendFundsModal(token);
	}

	// Copy address to clipboard
	let addressCopied = false;
	async function copyAddress() {
		if (!$walletAddress) return;
		try {
			await navigator.clipboard.writeText($walletAddress);
			addressCopied = true;
			setTimeout(() => (addressCopied = false), 2000);
		} catch (err) {
			console.error('Failed to copy:', err);
		}
	}

	// Basescan URL for wallet
	$: basescanUrl = $walletAddress ? `https://basescan.org/address/${$walletAddress}` : '';

	// Dust threshold for vaults (in token units)
	const DUST_THRESHOLD = 0.0001;
	let showDustVaults = false;

	let priceFeedsQuery = createPriceFeedsQuery($currentNetwork);
	$: priceFeedsQuery = createPriceFeedsQuery($currentNetwork);

	// Watch for network changes and show loading state
	$: if ($currentNetwork) {
		isNetworkLoading = true;
		setTimeout(() => {
			isNetworkLoading = false;
		}, 300);
	}

	// User Vaults Query - centralized with 60s polling on dashboard
	$: vaultsListQuery = createUserVaultsQuery($currentNetwork, $walletAddress, 60_000);

	// Query user's wallet holdings from SFTs
	$: walletHoldingsQuery = createQuery({
		queryKey: ['walletHoldings', $walletAddress, $currentNetwork?.id, $sfts?.length],
		enabled: !!($isAuthenticated && $walletAddress && $sfts && $currentNetwork),
		queryFn: () => {
			if (!$sfts || !$walletAddress) return [];

			const holdings: {
				id: string;
				address: string;
				name: string;
				symbol: string;
				walletBalance: bigint;
				decimals: number;
			}[] = [];

			for (const sft of $sfts) {
				const userHolder = sft.tokenHolders.find(
					(holder: { address: string }) =>
						holder.address.toLowerCase() === $walletAddress.toLowerCase()
				);

				holdings.push({
					id: sft.id,
					address: sft.address,
					name: sft.name,
					symbol: sft.symbol,
					walletBalance: userHolder ? BigInt(userHolder.balance) : 0n,
					decimals: 18
				});
			}

			return holdings;
		}
	});

	// Query USDC wallet balance
	$: usdcBalanceQuery = createQuery({
		queryKey: ['usdcWalletBalance', $walletAddress, $currentNetwork?.chainId],
		enabled: !!($isAuthenticated && $walletAddress && $currentNetwork && $wagmiConfig),
		queryFn: async () => {
			const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork.chainId] ?? [];
			if (paymentTokens.length === 0 || !$walletAddress) return [];

			const balances: {
				id: string;
				address: string;
				name: string;
				symbol: string;
				walletBalance: bigint;
				decimals: number;
			}[] = [];

			for (const token of paymentTokens) {
				try {
					const balance = await readContract($wagmiConfig, {
						abi: erc20Abi,
						address: token.address as `0x${string}`,
						functionName: 'balanceOf',
						args: [$walletAddress as `0x${string}`]
					});
					balances.push({
						id: token.address,
						address: token.address,
						name: token.name,
						symbol: token.symbol,
						walletBalance: balance as bigint,
						decimals: token.decimals
					});
				} catch (e) {
					console.error(`Failed to fetch balance for ${token.symbol}:`, e);
				}
			}

			return balances;
		}
	});

	// Query native ETH balance
	$: ethBalanceQuery = createQuery({
		queryKey: ['ethWalletBalance', $walletAddress, $currentNetwork?.chainId],
		enabled: !!($isAuthenticated && $walletAddress && $wagmiConfig),
		queryFn: async () => {
			if (!$walletAddress) return null;
			try {
				const balance = await getBalance($wagmiConfig, {
					address: $walletAddress as `0x${string}`
				});
				return {
					id: 'eth',
					address: 'native',
					name: 'Ethereum',
					symbol: 'ETH',
					walletBalance: balance.value,
					decimals: 18
				};
			} catch (e) {
				console.error('Failed to fetch ETH balance:', e);
				return null;
			}
		}
	});

	// Combined portfolio: wallet + vaults
	$: portfolioHoldings = (() => {
		const walletHoldings = $walletHoldingsQuery?.data ?? [];
		const usdcHoldings = $usdcBalanceQuery?.data ?? [];
		const vaultPages = $vaultsListQuery?.data?.pages ?? [];
		const allVaults = vaultPages.flatMap((p) => p.vaults ?? []);

		// Build map by token address
		const holdingsMap = new Map<
			string,
			{
				id: string;
				address: string;
				name: string;
				symbol: string;
				walletBalance: bigint;
				vaultBalance: bigint;
				decimals: number;
			}
		>();

		// Add wallet holdings (SFT tokens)
		for (const h of walletHoldings) {
			holdingsMap.set(h.address.toLowerCase(), {
				...h,
				vaultBalance: 0n
			});
		}

		// Add USDC/payment token wallet holdings
		for (const h of usdcHoldings) {
			holdingsMap.set(h.address.toLowerCase(), {
				...h,
				vaultBalance: 0n
			});
		}

		// Add vault balances
		for (const item of allVaults) {
			if (!item?.vault?.token) continue; // Skip if vault or token is undefined
			const { vault } = item;
			const tokenAddr = vault.token.address?.toLowerCase() ?? vault.token.id?.toLowerCase();
			if (!tokenAddr) continue; // Skip if no token address

			const existing = holdingsMap.get(tokenAddr);
			const vaultBal = BigInt(vault.balance || 0);

			if (existing) {
				existing.vaultBalance += vaultBal;
			} else {
				// Token in vault but not in wallet holdings (e.g., payment token)
				holdingsMap.set(tokenAddr, {
					id: vault.token.id ?? tokenAddr,
					address: vault.token.address ?? vault.token.id ?? tokenAddr,
					name: vault.token.name ?? 'Unknown',
					symbol: vault.token.symbol ?? '???',
					walletBalance: 0n,
					vaultBalance: vaultBal,
					decimals: Number(vault.token.decimals ?? 18)
				});
			}
		}

		// Convert to array with prices, filtering to only valid tokens
		const result = Array.from(holdingsMap.values())
			.filter((h) => validTokenAddresses.has(h.address.toLowerCase()))
			.map((h) => {
				const totalBalance = h.walletBalance + h.vaultBalance;
				const quote = findQuoteForSymbol(h.symbol, $priceFeedsQuery?.data ?? [], ALL_TOKENS);
				const price = quote?.close ?? 0;
				const priceChange = quote?.change ?? 0;
				const priceChangePercent = quote?.changePercent ?? 0;

				const balanceNum = parseFloat(formatUnits(totalBalance, h.decimals));
				const walletBalanceNum = parseFloat(formatUnits(h.walletBalance, h.decimals));
				const vaultBalanceNum = parseFloat(formatUnits(h.vaultBalance, h.decimals));

				return {
					...h,
					totalBalance: balanceNum,
					walletBalanceNum,
					vaultBalanceNum,
					price,
					value: balanceNum * price,
					priceChange,
					priceChangePercent
				};
			})
			.filter((h) => h.totalBalance > 0)
			.sort((a, b) => b.value - a.value);

		return result;
	})();

	$: totalValue = portfolioHoldings.reduce((sum, h) => sum + h.value, 0);

	// Split portfolio into funds (payment tokens) and holdings (asset tokens)
	$: paymentTokenAddresses = (() => {
		if (!$currentNetwork) return new Set<string>();
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork.chainId] ?? [];
		return new Set(paymentTokens.map((t) => t.address.toLowerCase()));
	})();

	// Build funds holdings (payment tokens + ETH)
	// Always show USDC even if balance is 0
	$: fundsHoldings = (() => {
		const funds = portfolioHoldings.filter((h) =>
			paymentTokenAddresses.has(h.address.toLowerCase())
		);

		// Ensure USDC is always shown (even with 0 balance)
		const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[$currentNetwork?.chainId ?? 0] ?? [];
		for (const token of paymentTokens) {
			const exists = funds.some((f) => f.address.toLowerCase() === token.address.toLowerCase());
			if (!exists) {
				funds.push({
					id: token.address,
					address: token.address,
					name: token.name,
					symbol: token.symbol,
					walletBalance: 0n,
					vaultBalance: 0n,
					decimals: token.decimals,
					totalBalance: 0,
					walletBalanceNum: 0,
					vaultBalanceNum: 0,
					price: 1, // USDC is pegged to $1
					value: 0,
					priceChange: 0,
					priceChangePercent: 0
				});
			}
		}

		// Add ETH if we have a balance
		const ethData = $ethBalanceQuery?.data;
		if (ethData && ethData.walletBalance > 0n) {
			const walletBalanceNum = parseFloat(formatUnits(ethData.walletBalance, 18));
			funds.unshift({
				id: 'eth',
				address: 'native',
				name: 'Ethereum',
				symbol: 'ETH',
				walletBalance: ethData.walletBalance,
				vaultBalance: 0n,
				decimals: 18,
				totalBalance: walletBalanceNum,
				walletBalanceNum,
				vaultBalanceNum: 0,
				price: 0, // ETH price not tracked in our feeds
				value: 0,
				priceChange: 0,
				priceChangePercent: 0
			});
		}

		return funds;
	})();
	$: assetHoldings = portfolioHoldings.filter(
		(h) => !paymentTokenAddresses.has(h.address.toLowerCase())
	);

	// Orders: Fetch orderbook quotes for all tokens
	$: orderbookQuotesQuery = createOrderbookQuotesQuery($currentNetwork, true);

	// Trade activity for market orders
	$: tradeActivityQuery = createTradeActivityQuery($currentNetwork);

	// Filter user's market orders from trades
	$: userMarketOrders = (() => {
		if (!$walletAddress || !$tradeActivityQuery.data?.trades) return [];
		const normalizedSender = $walletAddress.toLowerCase();

		return $tradeActivityQuery.data.trades.filter((trade: SgTrade) => {
			const tradeSender = trade.tradeEvent?.sender?.toLowerCase();
			return tradeSender === normalizedSender;
		});
	})();

	// Combined orders (limit + market)
	$: allOrders = (() => {
		const displayOrders: DisplayOrder[] = [];

		// Add limit orders from quotes (only user's orders)
		if ($orderbookQuotesQuery.data?.quotes && $walletAddress) {
			const myAddress = $walletAddress.toLowerCase();
			const myQuotes = $orderbookQuotesQuery.data.quotes.filter(
				(q) => q.sgOrder?.owner?.toLowerCase() === myAddress
			);

			for (const quote of myQuotes) {
				const isBuy = quote.side === 'bid';
				const tokenSymbol = isBuy ? quote.inputTokenSymbol : quote.outputTokenSymbol;
				const tokenAddress = isBuy ? quote.inputTokenAddress : quote.outputTokenAddress;
				const maxOutputBigInt = parseFloatHex(
					quote.maxOutput,
					isBuy ? quote.inputTokenDecimals || 18 : quote.outputTokenDecimals || 18
				);
				const isFilled = maxOutputBigInt === 0n;
				// Use the classified order type, defaulting to 'limit' if not set
				const orderType = quote.orderType ?? 'limit';

				displayOrders.push({
					type: orderType === 'dynamic-spread' ? 'custom' : orderType,
					orderHash: quote.orderHash,
					timestamp: quote.sgOrder?.timestampAdded ? Number(quote.sgOrder.timestampAdded) : 0,
					side: isBuy ? 'Buy' : 'Sell',
					quote,
					tokenSymbol,
					tokenAddress,
					inputTokenSymbol: quote.inputTokenSymbol,
					outputTokenSymbol: quote.outputTokenSymbol,
					price: quote.quotePerAsset,
					isActive: quote.sgOrder?.active ?? true,
					isFilled
				});
			}
		}

		// Add market orders (trades)
		for (const trade of userMarketOrders) {
			const chainId = $currentNetwork?.chainId;
			if (!chainId) continue;
			const displayOrder = transformTradeToDisplayOrder(trade, { chainId });
			if (displayOrder) {
				displayOrders.push(displayOrder);
			}
		}

		// Filter to only valid tokens, then sort by timestamp descending
		return displayOrders
			.filter((o) => validTokenAddresses.has(o.tokenAddress.toLowerCase()))
			.sort((a, b) => b.timestamp - a.timestamp);
	})();

	// Vaults: sorted with default vault first for each token, filtered to valid tokens only
	$: sortedVaults = (() => {
		const vaultPages = $vaultsListQuery?.data?.pages ?? [];
		const allVaults = vaultPages
			.flatMap((p) => p.vaults ?? [])
			.filter((v) => v?.vault?.token)
			.filter((v) => {
				const tokenAddr = v.vault.token?.address?.toLowerCase() ?? v.vault.token?.id?.toLowerCase();
				return tokenAddr && validTokenAddresses.has(tokenAddr);
			});

		// Sort: default vault (0x1) first, then by balance descending
		return allVaults.sort((a, b) => {
			// First, group by token
			const tokenA = a.vault.token?.symbol ?? '';
			const tokenB = b.vault.token?.symbol ?? '';
			if (tokenA !== tokenB) return tokenA.localeCompare(tokenB);

			// Within same token, default vault first
			const aIsDefault = a.vault.vaultId === DEFAULT_VAULT_ID;
			const bIsDefault = b.vault.vaultId === DEFAULT_VAULT_ID;
			if (aIsDefault && !bIsDefault) return -1;
			if (!aIsDefault && bIsDefault) return 1;

			// Then by balance descending
			return Number(BigInt(b.vault.balance || 0) - BigInt(a.vault.balance || 0));
		});
	})();

	// Split vaults into default and non-default (both filtered by balance > 0)
	$: defaultVaults = sortedVaults.filter(
		(v) => v.vault.vaultId === DEFAULT_VAULT_ID && BigInt(v.vault.balance) > 0n
	);
	$: allNonDefaultVaults = sortedVaults.filter(
		(v) => v.vault.vaultId !== DEFAULT_VAULT_ID && BigInt(v.vault.balance) > 0n
	);
	$: nonDefaultVaults = showDustVaults
		? allNonDefaultVaults
		: allNonDefaultVaults.filter((v) => {
				const balance = BigInt(v.vault.balance);
				const decimals = Number(v.vault.token?.decimals ?? 18);
				const balanceNum = parseFloat(formatUnits(balance, decimals));
				return balanceNum >= DUST_THRESHOLD;
			});
	$: dustVaultsCount = allNonDefaultVaults.length - nonDefaultVaults.length;

	$: activeOrdersCount = allOrders.filter((o) => o.type !== 'market' && o.isActive).length;
	$: activeVaultsCount = sortedVaults.filter((v) => BigInt(v.vault.balance) > 0n).length;
</script>

<!-- Main Content -->
<div class="relative z-10 min-h-screen text-white">
	<PageContainer>
		{#if isNetworkLoading}
			<div class="flex flex-col items-center justify-center gap-4 py-8">
				<LoadingSpinner
					variant="inline"
					size="md"
					text="Switching to {$currentNetwork?.displayName || 'network'}..."
				/>
			</div>
		{:else if !$isAuthenticated}
			<WalletConnectionPrompt
				description="Connect your wallet to access your dashboard and view your portfolio, orders, and vault positions on {$currentNetwork?.displayName ||
					'this network'}."
			/>
		{:else}
			<!-- Dashboard Header -->
			<Section>
				<div class="mb-6 flex flex-wrap items-start justify-between gap-4">
					<div>
						<h1 class="text-2xl font-bold">My Dashboard</h1>
						<div class="flex items-center gap-2 text-gray-400">
							<span class="sm:hidden">…{($walletAddress || '').slice(-6)}</span>
							<span class="hidden sm:inline">{truncateAddress($walletAddress || '')}</span>
							<!-- Copy button -->
							<button
								type="button"
								on:click={copyAddress}
								class="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-300"
								title="Copy address"
							>
								{#if addressCopied}
									<svg
										class="h-4 w-4 text-green-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M5 13l4 4L19 7"
										/>
									</svg>
								{:else}
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								{/if}
							</button>
							<!-- Basescan link -->
							<a
								href={basescanUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-gray-300"
								title="View on Basescan"
							>
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
									/>
								</svg>
							</a>
						</div>
					</div>
					<div class="flex gap-2">
						<Button variant="primary" size="sm" on:click={() => openDepositModal()}>
							<span class="flex items-center gap-1.5">
								<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 4v16m8-8H4"
									/>
								</svg>
								Add Funds
							</span>
						</Button>
						{#if $authMethod === 'privy'}
							<Button variant="secondary" size="sm" on:click={() => openSendFundsModal()}>
								<span class="flex items-center gap-1.5">
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
										/>
									</svg>
									Withdraw
								</span>
							</Button>
						{/if}
					</div>
				</div>

				<!-- Overview Stats -->
				<div class="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
					<MetricCard
						label="Total Value"
						value={`$${totalValue.toFixed(2)}`}
						paddingClass="p-3 sm:p-4"
						showGradient={false}
						valueClass="text-lg font-bold sm:text-2xl"
					/>
					<div class="hidden sm:block">
						<MetricCard
							label="24h Change"
							value="TBD"
							paddingClass="p-4"
							showGradient={false}
							change=""
							valueClass="text-2xl font-bold text-gray-400"
						/>
					</div>
					<MetricCard
						label="Active Orders"
						value={`${activeOrdersCount}`}
						paddingClass="p-3 sm:p-4"
						showGradient={false}
						valueClass="text-lg font-bold sm:text-2xl"
					/>
					<MetricCard
						label="Active Vaults"
						value={`${activeVaultsCount}`}
						paddingClass="p-3 sm:p-4"
						showGradient={false}
						valueClass="text-lg font-bold sm:text-2xl"
					/>
				</div>
			</Section>

			<!-- Tab Navigation -->
			<TabNav activeId={activeTab} on:change={handleDashboardTabChange} tabs={DASHBOARD_TABS} />

			<!-- Portfolio Tab -->
			{#if activeTab === 'portfolio'}
				{#if $walletHoldingsQuery.isLoading || $vaultsListQuery.isLoading || $usdcBalanceQuery.isLoading}
					<Section>
						<LoadingSpinner variant="inline" size="md" text="Loading portfolio..." />
					</Section>
				{:else}
					<!-- Funds Section (Payment Tokens) -->
					<Section>
						<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Funds</h2>
						<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
							Payment tokens available for trading
						</p>
						{#if fundsHoldings.length > 0}
							<div class="overflow-x-auto">
								<Table>
									<thead>
										<tr>
											<th
												class="sticky left-0 z-10 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Token</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Wallet</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Vaults</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Total</th
											>
											{#if $authMethod === 'privy'}
												<th
													class="px-2 py-2 text-center text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												></th>
											{/if}
										</tr>
									</thead>
									<tbody>
										{#each fundsHoldings as holding}
											{@const isEth = holding.address === 'native'}
											{@const paymentToken = isEth
												? null
												: (PAYMENT_TOKENS_BY_NETWORK[$currentNetwork?.chainId ?? 0] ?? []).find(
														(t) => t.address.toLowerCase() === holding.address.toLowerCase()
													)}
											{@const logoUrl = isEth ? '/images/ETH.svg' : paymentToken?.logoUrl}
											{@const decimalsForDisplay = holding.decimals === 6 ? 2 : 4}
											<tr class="hover:bg-white/5">
												<td class="sticky left-0 px-2 py-2 sm:px-4 sm:py-3">
													<TokenDisplay {logoUrl} symbol={holding.symbol} name={holding.name} />
												</td>
												<td class="hidden px-2 py-2 text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.walletBalanceNum.toFixed(decimalsForDisplay)}</td
												>
												<td class="hidden px-2 py-2 text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.vaultBalanceNum.toFixed(decimalsForDisplay)}</td
												>
												<td class="px-2 py-2 text-xs font-medium sm:px-4 sm:py-3 sm:text-sm"
													>{holding.totalBalance.toFixed(decimalsForDisplay)}</td
												>
												{#if $authMethod === 'privy'}
													<td class="px-2 py-2 sm:px-4 sm:py-3">
														{#if holding.walletBalanceNum > 0}
															<Button
																variant="secondary"
																size="sm"
																on:click={() => handleWithdraw(holding)}
															>
																Withdraw
															</Button>
														{:else}
															<span class="text-gray-500">—</span>
														{/if}
													</td>
												{/if}
											</tr>
										{/each}
									</tbody>
								</Table>
							</div>
						{:else}
							<EmptyState description="No funds found in your wallet or vaults." />
						{/if}
					</Section>

					<!-- Holdings Section (Asset Tokens) -->
					<Section>
						<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Holdings</h2>
						<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
							Asset tokens combined across wallet and vaults
						</p>
						{#if assetHoldings.length > 0}
							<div class="overflow-x-auto">
								<Table>
									<thead>
										<tr>
											<th
												class="sticky left-0 z-10 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Token</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Wallet</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Vaults</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>Total</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Price</th
											>
											<th
												class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
												>Value</th
											>
											<th
												class="hidden px-2 py-2 text-left text-xs font-medium text-gray-400 sm:table-cell sm:px-4 sm:py-3"
												>24h</th
											>
											<th
												class="px-2 py-2 text-center text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											></th>
										</tr>
									</thead>
									<tbody>
										{#each assetHoldings as holding}
											<tr class="hover:bg-white/5">
												<td class="sticky left-0 px-2 py-2 sm:px-4 sm:py-3">
													<TokenDisplay
														logoUrl={ALL_TOKENS.find(
															(s) => s.address.toLowerCase() === holding.address.toLowerCase()
														)?.logoUrl}
														symbol={holding.symbol}
														name={holding.name}
													/>
												</td>
												<td class="hidden px-2 py-2 text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.walletBalanceNum.toFixed(4)}</td
												>
												<td class="hidden px-2 py-2 text-gray-300 sm:table-cell sm:px-4 sm:py-3"
													>{holding.vaultBalanceNum.toFixed(4)}</td
												>
												<td class="hidden px-2 py-2 font-medium sm:table-cell sm:px-4 sm:py-3"
													>{holding.totalBalance.toFixed(4)}</td
												>
												<td class="px-2 py-2 text-xs sm:px-4 sm:py-3 sm:text-sm"
													>${holding.price.toFixed(2)}</td
												>
												<td class="px-2 py-2 text-xs font-medium sm:px-4 sm:py-3 sm:text-sm"
													>${holding.value.toFixed(2)}</td
												>
												<td class="hidden px-2 py-2 text-gray-400 sm:table-cell sm:px-4 sm:py-3">
													TBD
												</td>
												<td class="px-2 py-2 sm:px-4 sm:py-3">
													<div class="flex justify-center gap-2">
														<Button
															size="sm"
															variant="primary"
															on:click={() => goto(`/trade/${holding.id}`)}>Trade</Button
														>
														{#if $authMethod === 'privy' && holding.walletBalanceNum > 0}
															<Button
																size="sm"
																variant="secondary"
																on:click={() => handleWithdraw(holding)}
															>
																Withdraw
															</Button>
														{/if}
														<button
															type="button"
															on:click={() =>
																addTokenToWallet({
																	address: holding.address,
																	symbol: holding.symbol,
																	decimals: holding.decimals,
																	image: ALL_TOKENS.find(
																		(s) => s.address.toLowerCase() === holding.address.toLowerCase()
																	)?.logoUrl
																})}
															class="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs font-medium text-gray-300 transition hover:border-blue-400/50 hover:bg-blue-500/10 hover:text-blue-300"
															title="Track in Wallet"
														>
															<svg
																class="h-3 w-3"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																stroke-width="2"
															>
																<path
																	d="M12 5v14M5 12h14"
																	stroke-linecap="round"
																	stroke-linejoin="round"
																/>
															</svg>
															Track
														</button>
													</div>
												</td>
											</tr>
										{/each}
									</tbody>
								</Table>
							</div>
						{:else}
							<EmptyState description="No asset holdings found in your wallet or vaults." />
						{/if}
					</Section>
				{/if}

				<!-- Orders Tab -->
			{:else if activeTab === 'orders'}
				<Section>
					<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Your Orders</h2>
					<OrdersTable
						orders={allOrders}
						isLoading={$orderbookQuotesQuery.isLoading || $tradeActivityQuery.isLoading}
						isError={$orderbookQuotesQuery.isError}
						errorMessage={$orderbookQuotesQuery.error?.message ?? ''}
						showOwnerFilter={false}
					/>
				</Section>

				<!-- Vaults Tab -->
			{:else if activeTab === 'vaults'}
				<Section>
					{#if $vaultsListQuery.isLoading}
						<LoadingSpinner variant="inline" size="md" text="Loading vaults..." />
					{:else if $vaultsListQuery.isError}
						<div class="py-8 text-center text-sm text-red-400">
							Error loading vaults: {$vaultsListQuery.error?.message}
						</div>
					{:else if sortedVaults.length === 0}
						<EmptyState description="No vaults found." />
					{:else}
						<!-- Default Vaults Section -->
						<div class="mb-6 sm:mb-8">
							<h2 class="mb-2 text-base font-semibold sm:text-lg">Default Vaults</h2>
							<p class="mb-3 hidden text-sm text-gray-400 sm:mb-4 sm:block">
								Your primary vault for each token
							</p>
							{#if defaultVaults.length === 0}
								<div class="py-4 text-sm text-gray-500">
									No default vaults found. Default vaults are created automatically when you make a
									limit or DCA order.
								</div>
							{:else}
								<div class="overflow-x-auto">
									<table class="w-full text-sm">
										<thead>
											<tr class="text-left text-xs uppercase tracking-wide text-gray-400">
												<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Token</th>
												<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Balance</th>
												<th class="hidden pb-2 pr-2 font-medium sm:table-cell sm:pb-3 sm:pr-4"
													>Orders</th
												>
												<th class="pb-2 font-medium sm:pb-3"></th>
											</tr>
										</thead>
										<tbody>
											{#each defaultVaults as { vault, raindexVault }}
												{@const balance = BigInt(vault.balance)}
												{@const decimals = Number(vault.token.decimals ?? 18)}
												{@const balanceNum = parseFloat(formatUnits(balance, decimals))}
												{@const ordersCount =
													(vault.ordersAsInput?.length ?? 0) + (vault.ordersAsOutput?.length ?? 0)}
												<tr class="hover:bg-white/5">
													<td class="py-2 pr-2 sm:py-3 sm:pr-4">
														<div class="flex items-center gap-2">
															<span class="text-xs text-gray-200 sm:text-sm"
																>{vault.token.symbol}</span
															>
															<a
																href={getRaindexVaultUrl(
																	$currentNetwork?.chainId ?? 8453,
																	vault.orderbook.id,
																	vault.id
																)}
																target="_blank"
																rel="noopener noreferrer"
																class="text-blue-400 hover:text-blue-300"
																title="View on Raindex"
															>
																<svg
																	xmlns="http://www.w3.org/2000/svg"
																	class="h-3.5 w-3.5 sm:h-4 sm:w-4"
																	fill="none"
																	viewBox="0 0 24 24"
																	stroke="currentColor"
																>
																	<path
																		stroke-linecap="round"
																		stroke-linejoin="round"
																		stroke-width="2"
																		d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
																	/>
																</svg>
															</a>
														</div>
													</td>
													<td class="py-2 pr-2 text-xs text-gray-300 sm:py-3 sm:pr-4 sm:text-sm"
														>{balanceNum.toFixed(4)}</td
													>
													<td class="hidden py-2 pr-2 text-gray-400 sm:table-cell sm:py-3 sm:pr-4"
														>{ordersCount}</td
													>
													<td class="py-2 sm:py-3">
														{#if balance > 0n}
															<Button
																variant="danger"
																size="sm"
																on:click={() => transactionStore.handleWithdraw(raindexVault)}
																>Withdraw</Button
															>
														{:else}
															<span class="text-gray-500">—</span>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						</div>

						<!-- Non-Default Vaults Section -->
						{#if allNonDefaultVaults.length > 0}
							<div>
								<div class="mb-3 flex items-center justify-between sm:mb-4">
									<div>
										<h2 class="text-base font-semibold sm:text-lg">Other Vaults</h2>
										<p class="hidden text-sm text-gray-400 sm:block">
											Additional vaults with custom IDs
										</p>
									</div>
									{#if dustVaultsCount > 0 || showDustVaults}
										<label
											class="flex cursor-pointer items-center gap-1.5 text-xs text-gray-400 sm:gap-2 sm:text-sm"
										>
											<input
												type="checkbox"
												bind:checked={showDustVaults}
												class="h-3.5 w-3.5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900 sm:h-4 sm:w-4"
											/>
											<span class="sm:hidden">Dust ({dustVaultsCount})</span>
											<span class="hidden sm:inline"
												>Show dust ({dustVaultsCount} vault{dustVaultsCount === 1 ? '' : 's'})</span
											>
										</label>
									{/if}
								</div>
								{#if nonDefaultVaults.length > 0}
									<div class="overflow-x-auto">
										<table class="w-full text-sm">
											<thead>
												<tr class="text-left text-xs uppercase tracking-wide text-gray-400">
													<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Token</th>
													<th class="hidden pb-2 pr-2 font-medium sm:table-cell sm:pb-3 sm:pr-4"
														>Vault ID</th
													>
													<th class="pb-2 pr-2 font-medium sm:pb-3 sm:pr-4">Balance</th>
													<th class="hidden pb-2 pr-2 font-medium sm:table-cell sm:pb-3 sm:pr-4"
														>Orders</th
													>
													<th class="pb-2 font-medium sm:pb-3"></th>
												</tr>
											</thead>
											<tbody>
												{#each nonDefaultVaults as { vault, raindexVault }}
													{@const balance = BigInt(vault.balance)}
													{@const decimals = Number(vault.token.decimals ?? 18)}
													{@const balanceNum = parseFloat(formatUnits(balance, decimals))}
													{@const ordersCount =
														(vault.ordersAsInput?.length ?? 0) +
														(vault.ordersAsOutput?.length ?? 0)}
													<tr class="hover:bg-white/5">
														<td class="py-2 pr-2 sm:py-3 sm:pr-4">
															<span class="text-xs text-gray-200 sm:text-sm"
																>{vault.token.symbol}</span
															>
														</td>
														<td class="hidden py-2 pr-2 sm:table-cell sm:py-3 sm:pr-4">
															<a
																href={getRaindexVaultUrl(
																	$currentNetwork?.chainId ?? 8453,
																	vault.orderbook.id,
																	vault.id
																)}
																target="_blank"
																rel="noopener noreferrer"
																class="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline"
																title={vault.vaultId}
															>
																{vault.vaultId.slice(0, 10)}...{vault.vaultId.slice(-6)}
															</a>
														</td>
														<td class="py-2 pr-2 text-xs text-gray-300 sm:py-3 sm:pr-4 sm:text-sm"
															>{balanceNum.toFixed(4)}</td
														>
														<td class="hidden py-2 pr-2 text-gray-400 sm:table-cell sm:py-3 sm:pr-4"
															>{ordersCount}</td
														>
														<td class="py-2 sm:py-3">
															{#if balance > 0n}
																<Button
																	variant="danger"
																	size="sm"
																	on:click={() => transactionStore.handleWithdraw(raindexVault)}
																	>Withdraw</Button
																>
															{:else}
																<span class="text-gray-500">—</span>
															{/if}
														</td>
													</tr>
												{/each}
											</tbody>
										</table>
									</div>
								{:else}
									<div class="py-4 text-sm text-gray-500">
										All other vaults contain only dust amounts.
									</div>
								{/if}
							</div>
						{/if}
					{/if}
				</Section>

				<!-- Wallet Management Tab (Privy only) -->
			{:else if activeTab === 'wallet' && $authMethod === 'privy'}
				<Section>
					<div class="space-y-6">
						<!-- Wallet Actions -->
						<div>
							<h2 class="mb-3 text-base font-semibold sm:mb-4 sm:text-lg">Wallet Actions</h2>
							<div class="flex flex-wrap gap-3">
								<Button variant="primary" on:click={() => openDepositModal('buy')}>
									<span class="flex items-center gap-2">
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
											/>
										</svg>
										Buy Crypto
									</span>
								</Button>
								<Button variant="secondary" on:click={() => openDepositModal()}>
									<span class="flex items-center gap-2">
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 4v16m8-8H4"
											/>
										</svg>
										Add Funds
									</span>
								</Button>
								<Button variant="secondary" on:click={() => openSendFundsModal()}>
									<span class="flex items-center gap-2">
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
											/>
										</svg>
										Withdraw
									</span>
								</Button>
								<Button variant="ghost" on:click={() => exportPrivyWallet()}>
									<span class="flex items-center gap-2">
										<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
											/>
										</svg>
										Export Private Key
									</span>
								</Button>
							</div>
						</div>

						<!-- Transaction History -->
						<div>
							<div class="mb-3 flex items-center justify-between sm:mb-4">
								<div>
									<h2 class="text-base font-semibold sm:text-lg">Transaction History</h2>
									<p class="text-sm text-gray-400">Raw blockchain transactions from your wallet</p>
								</div>
								<a
									href={basescanUrl}
									target="_blank"
									rel="noopener noreferrer"
									class="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300"
								>
									View all on Basescan
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
										/>
									</svg>
								</a>
							</div>
							<div class="rounded-lg border border-gray-700 bg-gray-800/50 p-6 text-center">
								<p class="text-sm text-gray-400">
									Transaction history is available on Basescan. Click the link above to view all
									your wallet transactions.
								</p>
							</div>
						</div>
					</div>
				</Section>
			{/if}
		{/if}
	</PageContainer>

	<!-- Footer -->
	<Footer />
</div>
