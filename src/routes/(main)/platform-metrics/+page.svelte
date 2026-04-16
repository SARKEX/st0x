<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { getAllTokensByNetwork, networks, TOKENS, CRYPTO_TOKENS } from '$lib/config/network';
	import type { CategorizedToken, Network } from '$lib/config/network';
	import type { TradingViewQuote } from '$lib/api/tradingview';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import InfoBlock from '$lib/components/ui/InfoBlock.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { derived } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import { findQuoteForSymbol } from '$lib/utils/tradingViewSymbols';
	import {
		createTokenLookup,
		normalizeAddress,
		type TokenLookup
	} from '$lib/utils/tokenMath';
	import { createRaindexClient } from '$lib/clients/raindex';
	import type { GetVaultsFilters, RaindexVault } from '@rainlanguage/orderbook';
	import { createOrderbookQuotesQuery } from '$lib/queries/orderbook';
	import { createPriceFeedsQuery } from '$lib/queries/priceFeeds';
	import type { PublicTradeActivityResponse } from '../../api/public/trade-activity/+server';
	import { trackPageView } from '$lib/services/analytics';
	import { initScrollTracking } from '$lib/utils/scrollTracking';
	import { walletAddress } from '$lib/stores/authStore';

	interface TvlApiResponse {
		success: boolean;
		latest: {
			totalTvl: number;
			tokenTvl: Record<string, number>;
		} | null;
	}

	type NetworkStat = {
		network: (typeof networks)[number];
		tvl: number;
		networkTvl: number;
		dexLiquidity: number;
		tokenCount: number;
		tradingVolume: number;
		orderCount: number;
	};

	let selectedNetwork = networks[0];

	const priceFeedQueries = networks.map((network) => createPriceFeedsQuery(network));
	const orderbookQueries = networks.map((network) => createOrderbookQuotesQuery(network));

	const allPriceFeedQueries = derived(priceFeedQueries, (queries) => queries);
	const allOrderbookQueries = derived(orderbookQueries, (queries) => queries);

	let cleanupScrollTracking: (() => void) | null = null;

	onMount(() => {
		trackPageView('platform_metrics_page', {
			wallet_connected: Boolean($walletAddress)
		});
		cleanupScrollTracking = initScrollTracking('platform_metrics_page');

		void loadVaults();
		void loadAdminTvl();
		void loadTradeActivity();
	});

	onDestroy(() => {
		if (cleanupScrollTracking) {
			cleanupScrollTracking();
		}
	});

	$: priceFeedStates = networks.map((network, index) => ({
		network,
		query: $allPriceFeedQueries[index]
	}));

	$: orderbookStates = networks.map((network, index) => ({
		network,
		query: $allOrderbookQueries[index]
	}));

	let priceFeedByNetwork = new Map<number, TradingViewQuote[]>();
	$: priceFeedByNetwork = (() => {
		const map = new Map<number, TradingViewQuote[]>();
		priceFeedStates.forEach(({ network, query }) => {
			map.set(network.chainId, query?.data ?? []);
		});
		return map;
	})();

	let vaultsByNetwork = new Map<number, RaindexVault[]>();
	let vaultsLoading = true;
	let vaultsError: string | null = null;

	// Trade activity served pre-aggregated by /api/public/trade-activity
	// Replaces the old per-network tradeActivity queries that loaded ~4-6k raw trades
	// into the browser on cold loads (and frequently failed due to Goldsky rate limits).
	let tradeActivity: PublicTradeActivityResponse | null = null;
	let tradeActivityLoading = true;
	let tradeActivityError: string | null = null;

	async function loadTradeActivity() {
		tradeActivityLoading = true;
		tradeActivityError = null;
		try {
			const response = await fetch('/api/public/trade-activity');
			if (!response.ok) {
				throw new Error(`Failed to fetch trade activity (${response.status})`);
			}
			tradeActivity = (await response.json()) as PublicTradeActivityResponse;
		} catch (error) {
			console.error('Failed to load trade activity:', error);
			tradeActivityError =
				error instanceof Error ? error.message : 'Failed to load trade activity';
			tradeActivity = null;
		} finally {
			tradeActivityLoading = false;
		}
	}

	// TVL from public API (aggregate totals)
	let adminTvl: number | null = null;
	let adminTokenTvl: Record<string, number> = {};
	let adminTvlLoading = true;
	let adminTvlError: string | null = null;

	async function loadAdminTvl() {
		adminTvlLoading = true;
		adminTvlError = null;
		try {
			const response = await fetch('/api/public/tvl');
			if (!response.ok) {
				throw new Error('Failed to fetch TVL');
			}
			const data = (await response.json()) as TvlApiResponse;
			if (data.success && data.latest) {
				adminTvl = data.latest.totalTvl;
				adminTokenTvl = data.latest.tokenTvl ?? {};
			} else {
				adminTvl = null;
				adminTokenTvl = {};
			}
		} catch (error) {
			console.error('Failed to load TVL:', error);
			adminTvlError = error instanceof Error ? error.message : 'Failed to load TVL';
			adminTvl = null;
			adminTokenTvl = {};
		} finally {
			adminTvlLoading = false;
		}
	}

	async function loadVaults() {
		vaultsLoading = true;
		vaultsError = null;

		let client: Awaited<ReturnType<typeof createRaindexClient>>;
		try {
			client = await createRaindexClient();
		} catch (error) {
			console.error('Failed to create Raindex client', error);
			vaultsByNetwork = new Map();
			vaultsError = error instanceof Error ? error.message : 'Failed to load vault data';
			vaultsLoading = false;
			return;
		}

		const filters: GetVaultsFilters = { owners: [], hideZeroBalance: true };
		const MAX_PAGES = 50;
		const MAX_ATTEMPTS = 3;

		const fetchPageWithRetry = async (networkId: number, page: number) => {
			let lastError: Error | null = null;
			for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
				try {
					const result = await client.getVaults([networkId], filters, page);
					if (result.error) {
						throw new Error(result.error.readableMsg);
					}
					return result.value?.items ?? [];
				} catch (error) {
					lastError = error instanceof Error ? error : new Error(String(error));
					if (attempt < MAX_ATTEMPTS) {
						// Exponential backoff with jitter: ~400ms, ~900ms, ~1800ms
						const base = 400 * 2 ** (attempt - 1);
						const jitter = Math.random() * 200;
						await new Promise((resolve) => setTimeout(resolve, base + jitter));
					}
				}
			}
			throw lastError ?? new Error('Failed to fetch vaults');
		};

		// Serialize per-network vault loading and collect partial results.
		// Prior implementation ran all networks in parallel AND threw away every
		// network's data if any single network failed — so a rate-limited subgraph
		// would wipe the entire dex liquidity display.
		const map = new Map<number, RaindexVault[]>();
		const networkErrors: string[] = [];

		for (const network of networks) {
			try {
				const collected: RaindexVault[] = [];
				let page = 1;
				while (page <= MAX_PAGES) {
					const items = await fetchPageWithRetry(network.id, page);
					if (!items.length) break;
					collected.push(...items);
					if (items.length < 1000) break;
					page += 1;
				}
				map.set(network.chainId, collected);
			} catch (error) {
				console.error(`Failed to load vaults for ${network.name}`, error);
				networkErrors.push(
					`${network.displayName}: ${error instanceof Error ? error.message : 'unknown error'}`
				);
				// Leave this network out of the map — other networks still render.
			}
		}

		vaultsByNetwork = map;
		vaultsError = networkErrors.length ? networkErrors.join('; ') : null;
		vaultsLoading = false;
	}

	// Token metadata helpers
	$: ALL_TOKENS = (() => {
		const allTokens: CategorizedToken[] = [];
		networks.forEach((network) => {
			const networkTokens = getAllTokensByNetwork(network.chainId);
			allTokens.push(...networkTokens);
		});
		return allTokens.filter(
			(token, index, self) =>
				index === self.findIndex((t) => t.address.toLowerCase() === token.address.toLowerCase())
		);
	})();

	let tokenLookup: TokenLookup<CategorizedToken> = createTokenLookup([]);
	$: tokenLookup = createTokenLookup(ALL_TOKENS);

	// Create canonical token set (both ST0x and Crypto tokens)
	$: canonicalTokens = new Set<string>(
		[...TOKENS, ...CRYPTO_TOKENS]
			.map((token) => normalizeAddress(token.address))
			.filter(Boolean) as string[]
	);

	// Map per-network server response by chainId for quick lookup
	$: tradeActivityByChain = (() => {
		const map = new Map<number, PublicTradeActivityResponse['networks'][number]>();
		tradeActivity?.networks.forEach((n) => map.set(n.chainId, n));
		return map;
	})();

	// Identify tokens that are active on the current orderbook/trade activity
	// Only include tokens from the canonical list
	$: activeTokensByNetwork = (() => {
		const map = new Map<number, Set<string>>();
		networks.forEach((network) => {
			map.set(network.chainId, new Set<string>());
		});

		orderbookStates.forEach(({ network, query }) => {
			const set = map.get(network.chainId);
			if (!set) return;
			const summary = query?.data?.summary ?? {};
			Object.keys(summary).forEach((address) => {
				const normalised = normalizeAddress(address);
				if (normalised && canonicalTokens.has(normalised)) {
					set.add(normalised);
				}
			});
		});

		// Add tokens that had trades (per-network) from the server aggregate
		tradeActivityByChain.forEach((entry, chainId) => {
			const set = map.get(chainId);
			if (!set) return;
			entry.tokens.forEach((row) => {
				if (row.trades > 0 && canonicalTokens.has(row.address)) {
					set.add(row.address);
				}
			});
		});

		return map;
	})();

	function findNetworkQuote(symbol: string | undefined, networkId: number | undefined) {
		if (networkId == null) return undefined;
		const quotes = priceFeedByNetwork.get(networkId) ?? [];
		if (!quotes.length || !symbol) return undefined;
		return findQuoteForSymbol(symbol, quotes, ALL_TOKENS);
	}

	function getMidPrice(networkId: number, tokenAddress: string | null): number | null {
		if (!tokenAddress) return null;
		const summary =
			orderbookStates.find(({ network }) => network.chainId === networkId)?.query?.data?.summary ??
			{};
		const metrics = summary[tokenAddress] ?? summary[tokenAddress.toLowerCase()];
		if (!metrics) return null;
		const { bid, ask } = metrics;
		if (bid && ask) return (bid + ask) / 2;
		return bid ?? ask ?? null;
	}

	function vaultBalanceToNumber(vault: RaindexVault): number {
		const balance = parseFloat(vault.formattedBalance ?? '0');
		return Number.isFinite(balance) ? balance : 0;
	}

	$: tradingVolume = tradeActivity?.totals.tradingVolume ?? 0;
	$: totalTrades = tradeActivity?.totals.totalTrades ?? 0;

	// Build a set of tStock addresses for identification
	$: tStockAddresses = new Set<string>(
		TOKENS.filter((t) => t.category === 'ST0x')
			.map((t) => normalizeAddress(t.address))
			.filter(Boolean) as string[]
	);

	// Build payment token addresses for each network
	$: paymentTokenAddresses = new Set<string>(
		networks
			.map((n) => normalizeAddress(n.defaultPaymentToken?.address))
			.filter(Boolean) as string[]
	);

	// Calculate DEX Liquidity:
	// 1. Total USDC value of tStocks in output vaults (vault is used as ordersAsOutput)
	// 2. Plus total USDC in output vaults WHERE the input vault is a tStock
	$: dexLiquidity = (() => {
		if (vaultsLoading) return 0;
		let total = 0;

		// First, build a map of orderHash -> whether order has a tStock as input
		// This is done by looking at all vaults' ordersAsInput
		const orderHashHasTStockInput = new Map<string, boolean>();
		vaultsByNetwork.forEach((vaults) => {
			vaults.forEach((vault) => {
				const address = normalizeAddress(vault.token.address);
				const isTStock = address ? tStockAddresses.has(address) : false;
				// If this vault is used as input for orders, mark those orders
				if (isTStock && vault.ordersAsInput?.length > 0) {
					vault.ordersAsInput.forEach((order) => {
						const hash = order.orderHash?.toLowerCase();
						if (hash) {
							orderHashHasTStockInput.set(hash, true);
						}
					});
				}
			});
		});

		// Now calculate DEX liquidity
		vaultsByNetwork.forEach((vaults, networkId) => {
			vaults.forEach((vault) => {
				const address = normalizeAddress(vault.token.address);
				if (!address) return;
				const balance = vaultBalanceToNumber(vault);
				if (balance <= 0) return;

				const isTStock = tStockAddresses.has(address);
				const isPaymentToken = paymentTokenAddresses.has(address);
				const hasOrdersAsOutput = vault.ordersAsOutput && vault.ordersAsOutput.length > 0;

				if (!hasOrdersAsOutput) return;

				if (isTStock) {
					// Part 1: tStock in output vaults - get USDC value
					const tokenInfo = tokenLookup(address);
					const symbol = tokenInfo?.symbol ?? vault.token.symbol;
					let price = symbol ? findNetworkQuote(symbol, networkId)?.close ?? null : null;
					if (price == null) {
						price = getMidPrice(networkId, address);
					}
					if (price == null) {
						price = 0; // Don't assume price 1 for tStocks without price data
					}
					total += balance * price;
				} else if (isPaymentToken) {
					// Part 2: USDC in output vaults where input is a tStock
					// Check if any of this vault's orders have a tStock as input
					const hasTStockInputOrder = vault.ordersAsOutput?.some((order) => {
						const hash = order.orderHash?.toLowerCase();
						return hash ? orderHashHasTStockInput.get(hash) === true : false;
					});
					if (hasTStockInputOrder) {
						total += balance; // USDC value is 1:1
					}
				}
			});
		});

		return total;
	})();

	function getActiveVaultsForNetwork(networkId: number): RaindexVault[] {
		const vaults = vaultsByNetwork.get(networkId) ?? [];
		const activeSet = activeTokensByNetwork.get(networkId);
		if (!activeSet || activeSet.size === 0) {
			return vaults;
		}
		return vaults.filter((vault) => {
			const address = normalizeAddress(vault.token.address);
			return address ? activeSet.has(address) : false;
		});
	}

	$: networkStats = networks.map<NetworkStat>((network) => {
		const vaults = getActiveVaultsForNetwork(network.chainId);
		const allNetworkVaults = vaultsByNetwork.get(network.chainId) ?? [];

		// Aggregate vault balances by token
		const tokenBalances = new Map<string, number>();
		const uniqueTokens = new Set<string>();

		vaults.forEach((vault) => {
			const address = normalizeAddress(vault.token.address);
			if (!address) return;
			const balance = vaultBalanceToNumber(vault);
			if (balance <= 0) return;

			uniqueTokens.add(address);
			tokenBalances.set(address, (tokenBalances.get(address) ?? 0) + balance);
		});

		// Calculate TVL using aggregated balances - one price lookup per token
		let tvl = 0;
		tokenBalances.forEach((balance, address) => {
			const tokenInfo = tokenLookup(address);
			const symbol = tokenInfo?.symbol;
			let price = symbol ? findNetworkQuote(symbol, network.chainId)?.close ?? null : null;
			if (price == null) {
				price = getMidPrice(network.chainId, address);
			}
			if (price == null) {
				price = 1;
			}
			tvl += balance * price;
		});

		// Calculate per-network DEX liquidity
		let networkDexLiquidity = 0;
		const paymentTokenAddress = normalizeAddress(network.defaultPaymentToken?.address);

		// Build order -> tStock input map for this network
		const orderHashHasTStockInput = new Map<string, boolean>();
		allNetworkVaults.forEach((vault) => {
			const address = normalizeAddress(vault.token.address);
			const isTStock = address ? tStockAddresses.has(address) : false;
			if (isTStock && vault.ordersAsInput?.length > 0) {
				vault.ordersAsInput.forEach((order) => {
					const hash = order.orderHash?.toLowerCase();
					if (hash) {
						orderHashHasTStockInput.set(hash, true);
					}
				});
			}
		});

		allNetworkVaults.forEach((vault) => {
			const address = normalizeAddress(vault.token.address);
			if (!address) return;
			const balance = vaultBalanceToNumber(vault);
			if (balance <= 0) return;

			const isTStock = tStockAddresses.has(address);
			const isPaymentToken = paymentTokenAddress && address === paymentTokenAddress;
			const hasOrdersAsOutput = vault.ordersAsOutput && vault.ordersAsOutput.length > 0;

			if (!hasOrdersAsOutput) return;

			if (isTStock) {
				const tokenInfo = tokenLookup(address);
				const symbol = tokenInfo?.symbol ?? vault.token.symbol;
				let price = symbol ? findNetworkQuote(symbol, network.chainId)?.close ?? null : null;
				if (price == null) {
					price = getMidPrice(network.chainId, address);
				}
				if (price == null) {
					price = 0;
				}
				networkDexLiquidity += balance * price;
			} else if (isPaymentToken) {
				const hasTStockInputOrder = vault.ordersAsOutput?.some((order) => {
					const hash = order.orderHash?.toLowerCase();
					return hash ? orderHashHasTStockInput.get(hash) === true : false;
				});
				if (hasTStockInputOrder) {
					networkDexLiquidity += balance;
				}
			}
		});

		const tradingVolume = tradeActivityByChain.get(network.chainId)?.tradingVolume ?? 0;

		const orderHashes = new Set<string>();
		orderbookStates
			.find(({ network: net }) => net.chainId === network.chainId)
			?.query?.data?.quotes?.forEach((quote) => {
				if (quote.orderHash) {
					orderHashes.add(quote.orderHash.toLowerCase());
				}
			});

		// Calculate per-network TVL from admin token TVL data
		// Sum up TVL for tokens that belong to this network
		let networkTvl = 0;
		TOKENS.filter((t) => t.chainId === network.chainId).forEach((token) => {
			const tokenTvl = adminTokenTvl[token.symbol] ?? 0;
			networkTvl += tokenTvl;
		});

		return {
			network,
			tvl,
			networkTvl,
			dexLiquidity: networkDexLiquidity,
			tokenCount: uniqueTokens.size,
			tradingVolume,
			orderCount: orderHashes.size
		};
	});

	$: tokenTradingData = (() => {
		const rows = tradeActivityByChain.get(selectedNetwork.chainId)?.tokens ?? [];
		return rows.map((row) => ({
			symbol: row.symbol,
			name: row.name,
			logoUrl: row.logoUrl,
			inVolume: row.inVolume,
			outVolume: row.outVolume,
			totalVolume: row.totalVolume,
			quoteValue: formatQuoteDisplay(row.quoteVolume),
			trades: row.trades
		}));
	})();

	function formatQuote(value: number) {
		return value.toLocaleString('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		});
	}

	function formatQuoteDisplay(value: number) {
		const symbol = selectedNetwork.defaultPaymentToken?.symbol ?? 'Quote';
		const formatted = formatQuote(value);
		const normalised = symbol.toUpperCase();
		if (normalised === 'USD' || normalised === 'USDC') {
			return `$${formatted}`;
		}
		return `${formatted} ${symbol}`;
	}

	function formatQuoteDisplayWithNetwork(value: number, network: Network) {
		const symbol = network.defaultPaymentToken?.symbol ?? 'Quote';
		const formatted = formatQuote(value);
		const normalised = symbol.toUpperCase();
		if (normalised === 'USD' || normalised === 'USDC') {
			return `$${formatted}`;
		}
		return `${formatted} ${symbol}`;
	}

	$: metricsLoading = vaultsLoading || tradeActivityLoading || adminTvlLoading;
</script>

<div class="relative z-10 min-h-screen text-white">
	<PageContainer>
		{#if metricsLoading}
			<div class="flex min-h-[60vh] items-center justify-center">
				<LoadingSpinner size="lg" text="Loading metrics..." />
			</div>
		{:else}
			<div class="hidden sm:block">
				<InfoBlock
					variant="info"
					title="Multi-Network Data"
					description="Metrics aggregate active orderbook vaults and trades across all supported networks."
				/>
			</div>

			{#if vaultsError}
				<InfoBlock variant="warning" title="Vault data incomplete" description={vaultsError} />
			{/if}

			{#if adminTvlError}
				<InfoBlock variant="warning" title="TVL data incomplete" description={adminTvlError} />
			{/if}

			{#if tradeActivityError}
				<InfoBlock
					variant="warning"
					title="Trade activity incomplete"
					description={tradeActivityError}
				/>
			{/if}

			<div class="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
				<MetricCard
					label="TVL"
					value={adminTvl !== null ? `$${formatQuote(adminTvl)}` : 'N/A'}
					subtitle="Total value locked"
					paddingClass="p-4 sm:p-6"
					showGradient={false}
					valueClass="text-xl font-bold sm:text-3xl"
				/>
				<MetricCard
					label="Trading Volume"
					value={formatQuoteDisplay(tradingVolume)}
					subtitle="Last 30 days"
					paddingClass="p-4 sm:p-6"
					showGradient={false}
					valueClass="text-xl font-bold sm:text-3xl"
				/>
				<div class="hidden sm:block">
					<MetricCard
						label="Total Trades"
						value={`${totalTrades}`}
						subtitle="Last 30 days"
						paddingClass="p-6"
						showGradient={false}
						valueClass="text-3xl font-bold"
					/>
				</div>
				<div class="hidden sm:block">
					<MetricCard
						label="DEX Liquidity"
						value={`$${formatQuote(dexLiquidity)}`}
						subtitle="tStock order liquidity"
						paddingClass="p-6"
						showGradient={false}
						valueClass="text-3xl font-bold"
					/>
				</div>
			</div>

			<Section>
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<div>
						<h2 class="text-base font-semibold sm:text-lg">Stats by Network</h2>
						<p class="mt-1 hidden text-sm text-gray-400 sm:block">
							Live metrics sourced from active orderbook vaults
						</p>
					</div>
					<div class="flex items-center gap-1.5 text-xs text-green-400 sm:gap-2 sm:text-sm">
						<div class="h-2 w-2 rounded-full bg-green-400"></div>
						Live
					</div>
				</div>

				<Table>
					<thead>
						<tr>
							<th
								class="sticky left-0 z-10 p-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
							>
								Network
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
							>
								TVL
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
							>
								DEX Liquidity
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
							>
								Volume
							</th>
						</tr>
					</thead>
					<tbody>
						{#each networkStats as stats}
							<tr class="hover:bg-white/5">
								<td class="sticky left-0 p-2 sm:p-3 sm:text-sm">
									<div class="flex items-center gap-2 sm:gap-3">
										<img
											src={stats.network.chainId === 42161
												? '/images/ARB.svg'
												: stats.network.chainId === 8453
													? '/images/BASE.svg'
													: '/images/ETH.svg'}
											alt={stats.network.displayName}
											class="h-8 w-8 rounded-full sm:h-10 sm:w-10"
										/>
										<div class="min-w-0">
											<div class="truncate font-medium">{stats.network.displayName}</div>
											<div class="hidden text-xs text-gray-400 sm:block">{stats.network.name}</div>
										</div>
									</div></td
								>
								<td class="p-2 text-right text-xs font-medium text-green-400 sm:p-3 sm:text-sm">
									{formatQuoteDisplayWithNetwork(stats.networkTvl, stats.network)}
								</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">
									{formatQuoteDisplayWithNetwork(stats.dexLiquidity, stats.network)}
								</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">
									{formatQuoteDisplayWithNetwork(stats.tradingVolume, stats.network)}
								</td>
							</tr>
						{/each}
					</tbody>
				</Table>
			</Section>

			<Section>
				<div class="mb-4 sm:mb-6">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
						<div>
							<h2 class="text-base font-semibold sm:text-lg">Token Volumes</h2>
							<p class="mt-1 hidden text-sm text-gray-400 sm:block">
								Aggregated orderbook activity for {selectedNetwork.displayName}
							</p>
						</div>
						<select
							bind:value={selectedNetwork}
							class="rounded-lg bg-gray-800/50 px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-yellow-500"
						>
							{#each networks as network}
								<option value={network}>{network.displayName}</option>
							{/each}
						</select>
					</div>
				</div>

				<div class="overflow-x-auto">
					<table class="w-full">
						<thead>
							<tr class="text-left text-xs font-medium uppercase tracking-wide text-gray-400">
								<th class="sticky left-0 z-10 p-2 sm:p-3">Token</th>
								<th class="hidden p-2 text-right sm:table-cell sm:p-3">Total Volume</th>
								<th class="p-2 text-right sm:p-3">Value</th>
								<th class="p-2 text-right sm:p-3">Trades</th>
							</tr>
						</thead>
						<tbody>
							{#each tokenTradingData as token}
								<tr class="hover:bg-white/5">
									<td class="sticky left-0 p-2 sm:p-3">
										<div class="flex items-center gap-3">
											{#if token.logoUrl}
												<img src={token.logoUrl} alt={token.symbol} class="h-8 w-8 rounded-full" />
											{:else}
												<div
													class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-xs font-bold"
												>
													{token.symbol?.charAt(0)}
												</div>
											{/if}
											<div>
												<div class="text-xs font-medium sm:text-sm">{token.symbol}</div>
												<div class="hidden text-[11px] text-gray-400 sm:block">{token.name}</div>
											</div>
										</div>
									</td>
									<td class="hidden p-2 text-right text-yellow-400 sm:table-cell sm:p-3"
										>{token.totalVolume.toFixed(3)}</td
									>
									<td class="p-2 text-right text-xs font-medium sm:p-3 sm:text-sm"
										>{token.quoteValue}</td
									>
									<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">{token.trades}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</Section>
		{/if}
	</PageContainer>

	<Footer />
</div>
