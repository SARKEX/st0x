<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { networks } from '$lib/config/network';
	import type { CategorizedToken, Network } from '$lib/config/network';
	import { apiGetTokens } from '$lib/api/st0xApi';
	import type { TradingViewQuote } from '$lib/api/tradingview';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import InfoBlock from '$lib/components/ui/InfoBlock.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { derived } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import { findQuoteForSymbol } from '$lib/utils/tradingViewSymbols';
	import { createTokenLookup, normalizeAddress, type TokenLookup } from '$lib/utils/tokenMath';
	import { createRaindexClient } from '$lib/clients/raindex';
	import type { GetVaultsFilters, RaindexVault } from '@rainlanguage/raindex';
	import { createPriceFeedsQuery } from '$lib/queries/priceFeeds';
	import { normalizeApiTokensForNetwork } from '$lib/queries/tokens';
	import type { PublicTradeActivityResponse } from '../../api/public/trade-activity/+server';
	import { trackPageView } from '$lib/services/analytics';
	import { initScrollTracking } from '$lib/utils/scrollTracking';
	import { walletAddress } from '$lib/stores/authStore';
	import { createQuery } from '@tanstack/svelte-query';
	import { browser } from '$app/environment';

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
	const apiTokensQuery = createQuery<CategorizedToken[]>({
		queryKey: ['st0xApiTokens', 'allNetworks'],
		enabled: browser,
		staleTime: 0,
		refetchOnMount: 'always',
		refetchOnWindowFocus: true,
		queryFn: async () => {
			const apiTokens = await apiGetTokens();
			const tokens = networks.flatMap((network) =>
				normalizeApiTokensForNetwork(apiTokens, network.chainId)
			);
			return tokens.filter(
				(token, index, self) =>
					index === self.findIndex((t) => t.address.toLowerCase() === token.address.toLowerCase())
			);
		}
	});

	const allPriceFeedQueries = derived(priceFeedQueries, (queries) => queries);

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
			tradeActivityError = error instanceof Error ? error.message : 'Failed to load trade activity';
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
	$: ALL_TOKENS = $apiTokensQuery.data ?? [];

	let tokenLookup: TokenLookup<CategorizedToken> = createTokenLookup([]);
	$: tokenLookup = createTokenLookup(ALL_TOKENS);

	// Create canonical token set (both ST0x and Crypto tokens)
	$: canonicalTokens = new Set<string>(
		ALL_TOKENS.map((token) => normalizeAddress(token.address)).filter(Boolean) as string[]
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

		vaultsByNetwork.forEach((vaults, chainId) => {
			const set = map.get(chainId);
			if (!set) return;
			vaults.forEach((vault) => {
				if (!vault.ordersAsInput?.length && !vault.ordersAsOutput?.length) return;
				const normalised = normalizeAddress(vault.token.address);
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

	function getNetworkPrice(
		networkId: number,
		tokenAddress: string | null,
		symbol: string | undefined
	): number | null {
		const restPrice = symbol ? findNetworkQuote(symbol, networkId)?.close ?? null : null;
		if (restPrice != null) return restPrice;

		const network = networks.find((candidate) => candidate.chainId === networkId);
		const paymentTokenAddress = normalizeAddress(network?.defaultPaymentToken?.address);
		return tokenAddress && normalizeAddress(tokenAddress) === paymentTokenAddress ? 1 : null;
	}

	function vaultBalanceToNumber(vault: RaindexVault): number {
		const balance = parseFloat(vault.formattedBalance ?? '0');
		return Number.isFinite(balance) ? balance : 0;
	}

	$: tradingVolume = tradeActivity?.totals.tradingVolume ?? 0;
	$: totalTrades = tradeActivity?.totals.totalTrades ?? 0;

	// Build a set of tStock addresses for identification
	$: tStockAddresses = new Set<string>(
		ALL_TOKENS.filter((t) => t.category === 'ST0x')
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
					const price = getNetworkPrice(networkId, address, symbol) ?? 0;
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
			const price = getNetworkPrice(network.chainId, address, symbol) ?? 0;
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
				const price = getNetworkPrice(network.chainId, address, symbol) ?? 0;
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
		allNetworkVaults.forEach((vault) => {
			for (const order of [...(vault.ordersAsInput ?? []), ...(vault.ordersAsOutput ?? [])]) {
				if (order.orderHash) orderHashes.add(order.orderHash.toLowerCase());
			}
		});

		// Calculate per-network TVL from admin token TVL data
		// Sum up TVL for tokens that belong to this network
		let networkTvl = 0;
		ALL_TOKENS.filter((t) => t.chainId === network.chainId && t.category === 'ST0x').forEach(
			(token) => {
				const tokenTvl = adminTokenTvl[token.symbol] ?? 0;
				networkTvl += tokenTvl;
			}
		);

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

	// Count of distinct active markets (tokens) across networks — used for the
	// header "Live · N markets" pill. Derived from existing per-network active sets.
	$: liveMarketCount = (() => {
		const markets = new Set<string>();
		activeTokensByNetwork.forEach((set) => {
			set.forEach((address) => markets.add(address));
		});
		return markets.size;
	})();
</script>

<div class="relative z-10 min-h-screen text-text">
	<PageContainer>
		{#if metricsLoading}
			<div class="flex min-h-[60vh] items-center justify-center">
				<LoadingSpinner size="lg" text="Loading metrics..." />
			</div>
		{:else}
			<div class="mb-7 flex flex-wrap items-end justify-between gap-4">
				<div>
					<div
						class="mb-2 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.18em] text-accent"
					>
						<span class="h-px w-5 bg-accent-line"></span>Transparency · Live
					</div>
					<h1 class="font-display text-3xl font-bold tracking-tight text-text sm:text-4xl">
						Platform metrics
					</h1>
					<p class="mt-2 max-w-xl text-[15px] text-text-2">
						Onchain activity across st0x — every figure is read from Base mainnet and refreshes each
						block.
					</p>
				</div>
				<div
					class="flex items-center gap-2 rounded-full border border-accent-line bg-accent-soft px-3.5 py-2 font-mono text-[12px] font-semibold text-accent"
				>
					<span class="relative flex h-1.5 w-1.5">
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70"
						></span>
						<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent"></span>
					</span>
					Live · {liveMarketCount} markets
				</div>
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

			<div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<!-- Headline TVL card — accent treatment (mint glow + live ping dot) -->
				<div
					class="relative overflow-hidden rounded-2xl border border-accent-line bg-gradient-to-br from-accent-soft to-transparent p-5"
				>
					<div
						class="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent-glow blur-2xl"
					></div>
					<div class="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-text-3">
						<span class="relative flex h-1.5 w-1.5">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70"
							></span>
							<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent"></span>
						</span>
						Total value locked
					</div>
					<div class="mt-2 font-mono text-3xl font-bold text-accent">
						{adminTvl !== null ? `$${formatQuote(adminTvl)}` : 'N/A'}
					</div>
					<div class="mt-2 font-mono text-[12px] text-text-2">Across all vaults</div>
				</div>

				<div class="rounded-2xl border border-line bg-overlay-1 p-5">
					<div class="text-[11px] uppercase tracking-wider text-text-3">24h Volume</div>
					<div class="mt-2 font-mono text-3xl font-bold text-text">
						{formatQuoteDisplay(tradingVolume)}
					</div>
					<div class="mt-2 font-mono text-[12px] text-text-2">Last 30 days</div>
				</div>

				<div class="hidden rounded-2xl border border-line bg-overlay-1 p-5 sm:block">
					<div class="text-[11px] uppercase tracking-wider text-text-3">Total trades</div>
					<div class="mt-2 font-mono text-3xl font-bold text-text">{totalTrades}</div>
					<div class="mt-2 font-mono text-[12px] text-text-2">Last 30 days</div>
				</div>

				<div class="hidden rounded-2xl border border-line bg-overlay-1 p-5 sm:block">
					<div class="text-[11px] uppercase tracking-wider text-text-3">DEX liquidity</div>
					<div class="mt-2 font-mono text-3xl font-bold text-text">
						${formatQuote(dexLiquidity)}
					</div>
					<div class="mt-2 font-mono text-[12px] text-text-2">tStock order liquidity</div>
				</div>
			</div>

			<div class="mt-4 rounded-2xl border border-line bg-overlay-1 p-5">
				<div class="mb-4 flex items-center justify-between sm:mb-6">
					<div>
						<h2 class="text-base font-semibold text-text sm:text-lg">Stats by Network</h2>
						<p class="mt-1 hidden text-sm text-text-2 sm:block">
							Live metrics sourced from active orderbook vaults
						</p>
					</div>
					<div class="flex items-center gap-1.5 text-xs text-accent sm:gap-2 sm:text-sm">
						<span class="relative flex h-2 w-2">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70"
							></span>
							<span class="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
						</span>
						Live
					</div>
				</div>

				<Table>
					<thead>
						<tr>
							<th
								class="sticky left-0 z-10 p-2 text-left text-xs font-medium uppercase tracking-wide text-text-2 sm:p-3"
							>
								Network
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-text-2 sm:p-3"
							>
								TVL
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-text-2 sm:p-3"
							>
								DEX Liquidity
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-text-2 sm:p-3"
							>
								Volume
							</th>
						</tr>
					</thead>
					<tbody>
						{#each networkStats as stats}
							<tr class="hover:bg-overlay-hover">
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
											<div class="hidden text-xs text-text-2 sm:block">{stats.network.name}</div>
										</div>
									</div></td
								>
								<td
									class="p-2 text-right font-mono text-xs font-medium text-accent sm:p-3 sm:text-sm"
								>
									{formatQuoteDisplayWithNetwork(stats.networkTvl, stats.network)}
								</td>
								<td class="p-2 text-right font-mono text-xs sm:p-3 sm:text-sm">
									{formatQuoteDisplayWithNetwork(stats.dexLiquidity, stats.network)}
								</td>
								<td class="p-2 text-right font-mono text-xs sm:p-3 sm:text-sm">
									{formatQuoteDisplayWithNetwork(stats.tradingVolume, stats.network)}
								</td>
							</tr>
						{/each}
					</tbody>
				</Table>
			</div>

			<div class="mt-4 rounded-2xl border border-line bg-overlay-1 p-5">
				<div class="mb-4 sm:mb-6">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
						<div>
							<h2 class="text-base font-semibold text-text sm:text-lg">Token Volumes</h2>
							<p class="mt-1 hidden text-sm text-text-2 sm:block">
								Aggregated orderbook activity for {selectedNetwork.displayName}
							</p>
						</div>
						<select
							bind:value={selectedNetwork}
							class="rounded-lg border border-line bg-overlay-strong px-4 py-2 text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent"
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
							<tr class="text-left text-xs font-medium uppercase tracking-wide text-text-2">
								<th class="sticky left-0 z-10 p-2 sm:p-3">Token</th>
								<th class="hidden p-2 text-right sm:table-cell sm:p-3">Total Volume</th>
								<th class="p-2 text-right sm:p-3">Value</th>
								<th class="p-2 text-right sm:p-3">Trades</th>
							</tr>
						</thead>
						<tbody>
							{#each tokenTradingData as token}
								<tr class="hover:bg-overlay-hover">
									<td class="sticky left-0 p-2 sm:p-3">
										<div class="flex items-center gap-3">
											{#if token.logoUrl}
												<img src={token.logoUrl} alt={token.symbol} class="h-8 w-8 rounded-full" />
											{:else}
												<div
													class="flex h-8 w-8 items-center justify-center rounded-full bg-surface-3 text-xs font-bold"
												>
													{token.symbol?.charAt(0)}
												</div>
											{/if}
											<div>
												<div class="text-xs font-medium sm:text-sm">{token.symbol}</div>
												<div class="hidden text-[11px] text-text-2 sm:block">{token.name}</div>
											</div>
										</div>
									</td>
									<td class="hidden p-2 text-right font-mono text-text sm:table-cell sm:p-3"
										>{token.totalVolume.toFixed(3)}</td
									>
									<td class="p-2 text-right font-mono text-xs font-medium sm:p-3 sm:text-sm"
										>{token.quoteValue}</td
									>
									<td class="p-2 text-right font-mono text-xs sm:p-3 sm:text-sm">{token.trades}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		{/if}
	</PageContainer>

	<Footer />
</div>
