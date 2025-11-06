<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { getAllTokensByNetwork, networks, TOKENS, CRYPTO_TOKENS } from '$lib/network';
import type { CategorizedToken, Network } from '$lib/network';
	import type { TradingViewQuote } from '$lib/services/tradingview';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import InfoBlock from '$lib/components/ui/InfoBlock.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { derived } from 'svelte/store';
	import { onMount } from 'svelte';
	import {
		getResourceStore,
		ensureResource,
		type TimedResource,
		type TradeMetricPayload,
		type OrderbookQuoteCache
	} from '$lib/stores/network-data-cache';
	import { findQuoteForSymbol } from '$lib/utils/tokenQuotes';
	import {
		analyzeTrade,
		createTokenLookup,
		normalizeAddress,
		type TradeAnalysis,
		type TokenLookup
	} from '$lib/utils/tokenMath';
	import type { SgTrade } from '@rainlanguage/orderbook';
	import { createRaindexClient } from '$lib/utils/raindexClient';
	import type { GetVaultsFilters, RaindexVault } from '@rainlanguage/orderbook';

	type AnalyzedTrade = {
		trade: SgTrade;
		analysis: TradeAnalysis;
	};

	type NetworkStat = {
		network: (typeof networks)[number];
		tvl: number;
		tokenCount: number;
		tradingVolume: number;
		orderCount: number;
	};

	let selectedNetwork = networks[0];

	const priceFeedResourceStores = networks.map((network) =>
		getResourceStore(network.id, 'priceFeeds')
	);
	const tradeResourceStores = networks.map((network) =>
		getResourceStore(network.id, 'tradeActivity')
	);
	const orderbookResourceStores = networks.map((network) =>
		getResourceStore(network.id, 'orderbookQuotes')
	);

	const allPriceFeedResources = derived(
		priceFeedResourceStores,
		(resources) => resources,
		priceFeedResourceStores.map(() => null as TimedResource<TradingViewQuote[]> | null)
	);

	const allTradeResources = derived(
		tradeResourceStores,
		(resources) => resources,
		tradeResourceStores.map(() => null as TimedResource<TradeMetricPayload> | null)
	);

	const allOrderbookResources = derived(
		orderbookResourceStores,
		(resources) => resources,
		orderbookResourceStores.map(() => null as TimedResource<OrderbookQuoteCache> | null)
	);

	onMount(() => {
		networks.forEach((network) => {
			ensureResource(network.id, 'priceFeeds');
			ensureResource(network.id, 'tradeActivity');
			ensureResource(network.id, 'orderbookQuotes');
		});
		void loadVaults();
	});

	$: priceFeedStates = networks.map((network, index) => ({
		network,
		resource: $allPriceFeedResources[index]
	}));

	$: tradeStates = networks.map((network, index) => ({
		network,
		resource: $allTradeResources[index]
	}));

	$: orderbookStates = networks.map((network, index) => ({
		network,
		resource: $allOrderbookResources[index]
	}));

	let priceFeedByNetwork = new Map<number, TradingViewQuote[]>();
	$: priceFeedByNetwork = (() => {
		const map = new Map<number, TradingViewQuote[]>();
		priceFeedStates.forEach(({ network, resource }) => {
			map.set(network.chainId, resource?.data ?? []);
		});
		return map;
	})();

	$: allNetworksTrades = tradeStates.map(({ network, resource }) => ({
		network,
		trades: resource?.data?.trades ?? [],
		range: resource?.data?.range,
		status: resource?.status ?? 'idle'
	}));

	let vaultsByNetwork = new Map<number, RaindexVault[]>();
	let vaultsLoading = true;
	let vaultsError: string | null = null;

	async function loadVaults() {
		vaultsLoading = true;
		vaultsError = null;
		try {
			const client = await createRaindexClient();
			const map = new Map<number, RaindexVault[]>();
			const filters: GetVaultsFilters = { owners: [], hideZeroBalance: true };

			await Promise.all(
				networks.map(async (network) => {
					const collected: RaindexVault[] = [];
					let page = 1;
					const MAX_PAGES = 50;
					while (page <= MAX_PAGES) {
						const result = await client.getVaults([network.id], filters, page);
						if (result.error) {
							throw new Error(result.error.readableMsg);
						}
						const items = result.value?.items ?? [];
						if (!items.length) {
							break;
						}
						collected.push(...items);
						if (items.length < 1000) {
							break;
						}
						page += 1;
					}
					map.set(network.chainId, collected);
				})
			);

			vaultsByNetwork = map;
		} catch (error) {
			console.error('Failed to load vaults', error);
			vaultsByNetwork = new Map();
			vaultsError = error instanceof Error ? error.message : 'Failed to load vault data';
		} finally {
			vaultsLoading = false;
		}
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

	// Analyze trades once per network for reuse
	$: analyzedTradesByNetwork = (() => {
		const map = new Map<number, AnalyzedTrade[]>();
		allNetworksTrades.forEach(({ network, trades }) => {
			const analyzed: AnalyzedTrade[] = [];
			trades.forEach((trade) => {
				const analysis = analyzeTrade(
					trade as unknown as {
						inputVaultBalanceChange?: {
							vault?: { token?: { address?: string; decimals?: number; symbol?: string } };
							amount?: string;
						};
						outputVaultBalanceChange?: {
							vault?: { token?: { address?: string; decimals?: number; symbol?: string } };
							amount?: string;
						};
					},
					network.defaultPaymentToken,
					tokenLookup
				);
				if (analysis) {
					analyzed.push({ trade, analysis });
				}
			});
			map.set(network.chainId, analyzed);
		});
		return map;
	})();

	// Identify tokens that are active on the current orderbook/trade activity
	// Only include tokens from the canonical list
	$: activeTokensByNetwork = (() => {
		const map = new Map<number, Set<string>>();
		networks.forEach((network) => {
			map.set(network.chainId, new Set<string>());
		});

		orderbookStates.forEach(({ network, resource }) => {
			const set = map.get(network.chainId);
			if (!set) return;
			const summary = resource?.data?.summary ?? {};
			Object.keys(summary).forEach((address) => {
				const normalised = normalizeAddress(address);
				if (normalised && canonicalTokens.has(normalised)) {
					set.add(normalised);
				}
			});
		});

		analyzedTradesByNetwork.forEach((entries, chainId) => {
			const set = map.get(chainId);
			if (!set) return;
			entries.forEach(({ analysis }) => {
				const addr = normalizeAddress(analysis.assetAddress);
				if (addr && canonicalTokens.has(addr)) {
					set.add(addr);
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
			orderbookStates.find(({ network }) => network.chainId === networkId)?.resource?.data
				?.summary ?? {};
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

	// Aggregate metrics
	$: totalTVL = (() => {
		if (vaultsLoading) return 0;
		let total = 0;
		vaultsByNetwork.forEach((vaults, networkId) => {
			const activeSet = activeTokensByNetwork.get(networkId);
			vaults.forEach((vault) => {
				const address = normalizeAddress(vault.token.address);
				if (activeSet && activeSet.size > 0 && (!address || !activeSet.has(address))) return;
				const balance = vaultBalanceToNumber(vault);
				if (balance <= 0) return;
				const tokenInfo = address ? tokenLookup(address) : undefined;
				const symbol = tokenInfo?.symbol ?? vault.token.symbol;
				let price = symbol ? findNetworkQuote(symbol, networkId)?.close ?? null : null;
				if (price == null) {
					price = getMidPrice(networkId, address);
				}
				if (price == null) {
					price = 1;
				}
				total += balance * price;
			});
		});
		return total;
	})();

	$: tradingVolume = (() => {
		let volume = 0;
		analyzedTradesByNetwork.forEach((entries, chainId) => {
			const activeSet = activeTokensByNetwork.get(chainId);
			const seenTx = new Set<string>();
			entries.forEach(({ trade, analysis }) => {
				const address = normalizeAddress(analysis.assetAddress);
				if (activeSet && activeSet.size > 0 && address && !activeSet.has(address)) return;
				const txId = trade.tradeEvent?.transaction?.id ?? trade.id;
				if (txId) {
					if (seenTx.has(txId)) return;
					seenTx.add(txId);
				}
				volume += analysis.quote;
			});
		});
		return volume;
	})();

	$: totalTrades = (() => {
		let total = 0;
		analyzedTradesByNetwork.forEach((entries, chainId) => {
			const activeSet = activeTokensByNetwork.get(chainId);
			entries.forEach(({ analysis }) => {
				const address = normalizeAddress(analysis.assetAddress);
				if (activeSet && activeSet.size > 0 && address && !activeSet.has(address)) return;
				total += 1;
			});
		});
		return total;
	})();

	$: activeST0x = (() => {
		const set = new Set<string>();
		vaultsByNetwork.forEach((vaults, networkId) => {
			const activeSet = activeTokensByNetwork.get(networkId);
			vaults.forEach((vault) => {
				const address = normalizeAddress(vault.token.address);
				if (!address) return;
				if (activeSet && activeSet.size > 0 && !activeSet.has(address)) return;
				if (vaultBalanceToNumber(vault) <= 0) return;
				set.add(address);
			});
		});
		return set.size;
	})();

	$: totalDeployedOrders = (() => {
		const hashes = new Set<string>();
		orderbookStates.forEach(({ resource }) => {
			resource?.data?.quotes?.forEach((quote) => {
				if (quote.orderHash) {
					hashes.add(quote.orderHash.toLowerCase());
				}
			});
		});
		return hashes.size;
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
		const startTime = performance.now();
		const vaults = getActiveVaultsForNetwork(network.chainId);

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

		console.log(
			`TVL calc for ${network.displayName}: ${performance.now() - startTime}ms, vaults processed: ${
				vaults.length
			}, unique tokens: ${uniqueTokens.size}`
		);

		const trades = analyzedTradesByNetwork.get(network.chainId) ?? [];
		let tradingVolume = 0;
		const seenTx = new Set<string>();
		const activeSet = activeTokensByNetwork.get(network.chainId);
		trades.forEach(({ trade, analysis }) => {
			const address = normalizeAddress(analysis.assetAddress);
			if (activeSet && activeSet.size > 0 && address && !activeSet.has(address)) return;
			const txId = trade.tradeEvent?.transaction?.id ?? trade.id;
			if (txId) {
				if (seenTx.has(txId)) return;
				seenTx.add(txId);
			}
			tradingVolume += analysis.quote;
		});

		const orderHashes = new Set<string>();
		orderbookStates
			.find(({ network: net }) => net.chainId === network.chainId)
			?.resource?.data?.quotes?.forEach((quote) => {
				if (quote.orderHash) {
					orderHashes.add(quote.orderHash.toLowerCase());
				}
			});

		return {
			network,
			tvl,
			tokenCount: uniqueTokens.size,
			tradingVolume,
			orderCount: orderHashes.size
		};
	});

	$: tokenTradingData = (() => {
		const entries = analyzedTradesByNetwork.get(selectedNetwork.chainId) ?? [];
		const aggregated = new Map<
			string,
			{
				symbol?: string;
				name?: string;
				logoUrl?: string;
				inVolume: number;
				outVolume: number;
				totalVolume: number;
				quoteVolume: number;
				transactions: Set<string>;
			}
		>();

		// Initialize all canonical tokens for the selected network
		[...TOKENS, ...CRYPTO_TOKENS]
			.filter((token) => token.chainId === selectedNetwork.chainId)
			.forEach((token) => {
				const address = normalizeAddress(token.address);
				if (address) {
					aggregated.set(address, {
						symbol: token.symbol,
						name: token.name,
						logoUrl: token.logoUrl,
						inVolume: 0,
						outVolume: 0,
						totalVolume: 0,
						quoteVolume: 0,
						transactions: new Set<string>()
					});
				}
			});

		// Populate with trade data
		entries.forEach(({ trade, analysis }) => {
			const address = normalizeAddress(analysis.assetAddress);
			if (!address || !aggregated.has(address)) return;
			const record = aggregated.get(address);
			if (!record) return;

			if (analysis.side === 'bid') {
				record.inVolume += analysis.tokens;
			} else if (analysis.side === 'ask') {
				record.outVolume += analysis.tokens;
			}
			record.totalVolume += analysis.tokens;

			const txId = trade.tradeEvent?.transaction?.id ?? trade.id;
			if (txId && !record.transactions.has(txId)) {
				record.transactions.add(txId);
				record.quoteVolume += analysis.quote;
			}
		});

		return Array.from(aggregated.values())
			.map((record) => ({
				symbol: record.symbol,
				name: record.name,
				logoUrl: record.logoUrl,
				inVolume: record.inVolume,
				outVolume: record.outVolume,
				totalVolume: record.totalVolume,
				quoteValue: formatQuoteDisplay(record.quoteVolume),
				trades: record.transactions.size
			}))
			.sort((a, b) => b.trades - a.trades);
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

	$: tradeLoading = tradeStates.some(({ resource }) => {
		const count = resource?.data?.trades?.length ?? 0;
		return (
			!resource || resource.status === 'idle' || (resource.status === 'loading' && count === 0)
		);
	});

	$: metricsLoading = vaultsLoading || tradeLoading;
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<PageContainer>
		{#if metricsLoading}
			<div class="flex min-h-[60vh] items-center justify-center">
				<LoadingSpinner size="lg" text="Loading metrics..." />
			</div>
		{:else}
			<InfoBlock
				variant="info"
				title="Multi-Network Data"
				description="Metrics aggregate active orderbook vaults and trades across all supported networks."
			/>

			{#if vaultsError}
				<InfoBlock variant="warning" title="Vault data incomplete" description={vaultsError} />
			{/if}

			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<MetricCard
					label="Total Locked Value"
					value={formatQuoteDisplay(totalTVL)}
					subtitle="Active orderbook tokens"
					cardClass="bg-gray-800/50 border border-white/10"
					paddingClass="p-6"
					showGradient={false}
					valueClass="text-3xl font-bold"
				/>
				<MetricCard
					label="Trading Volume"
					value={formatQuoteDisplay(tradingVolume)}
					subtitle="Last 30 days"
					cardClass="bg-gray-800/50 border border-white/10"
					paddingClass="p-6"
					showGradient={false}
					valueClass="text-3xl font-bold"
				/>
				<MetricCard
					label="Total Trades"
					value={`${totalTrades}`}
					subtitle="Last 30 days"
					cardClass="bg-gray-800/50 border border-white/10"
					paddingClass="p-6"
					showGradient={false}
					valueClass="text-3xl font-bold"
				/>
				<MetricCard
					label="Active Tokens"
					value={`${activeST0x}`}
					subtitle="Live on orderbook"
					cardClass="bg-gray-800/50 border border-white/10"
					paddingClass="p-6"
					showGradient={false}
					valueClass="text-3xl font-bold"
				/>
				<MetricCard
					label="Deployed Orders"
					value={`${totalDeployedOrders}`}
					subtitle="Active across networks"
					cardClass="bg-gray-800/50 border border-white/10"
					paddingClass="p-6"
					showGradient={false}
					valueClass="text-3xl font-bold"
				/>
			</div>

			<Section>
				<div class="mb-6 flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">Stats by Network</h2>
						<p class="mt-1 text-sm text-gray-400">
							Live metrics sourced from active orderbook vaults
						</p>
					</div>
					<div class="flex items-center gap-2 text-sm text-green-400">
						<div class="h-2 w-2 rounded-full bg-green-400"></div>
						Live Data
					</div>
				</div>

				<Table>
					<thead>
						<tr class="border-b border-white/10">
							<th
								class="sticky left-0 z-10 bg-gray-800 p-2 text-left text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
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
								Active Tokens
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
							>
								Trading Volume
							</th>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
							>
								Deployed Orders
							</th>
						</tr>
					</thead>
					<tbody>
						{#each networkStats as stats}
							<tr class="border-b border-white/5">
								<td class="sticky left-0 bg-gray-800 p-2 sm:p-3 sm:text-sm">
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
									{formatQuoteDisplayWithNetwork(stats.tvl, stats.network)}
								</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">{stats.tokenCount}</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">
									{formatQuoteDisplayWithNetwork(stats.tradingVolume, stats.network)}
								</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">{stats.orderCount}</td>
							</tr>
						{/each}
					</tbody>
				</Table>
			</Section>

			<Section>
				<div class="mb-6">
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 class="text-xl font-semibold">Token Trading Volumes</h2>
							<p class="mt-1 text-sm text-gray-400">
								Aggregated orderbook activity for {selectedNetwork.displayName}
							</p>
						</div>
						<select
							bind:value={selectedNetwork}
							class="rounded-lg border border-white/10 bg-gray-800 px-4 py-2 text-sm focus:border-yellow-500 focus:outline-none"
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
							<tr
								class="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-gray-400"
							>
								<th class="sticky left-0 z-10 bg-gray-800 p-2 sm:p-3">Token</th>
								<th class="p-2 text-right sm:p-3">Total Volume</th>
								<th class="p-2 text-right sm:p-3">USD Value</th>
								<th class="p-2 text-right sm:p-3">Trades</th>
							</tr>
						</thead>
						<tbody>
							{#each tokenTradingData as token}
								<tr class="border-b border-white/5 hover:bg-white/5">
									<td class="sticky left-0 bg-gray-800 p-2 sm:p-3">
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
									<td class="p-2 text-right text-yellow-400 sm:p-3"
										>{token.totalVolume.toFixed(3)}</td
									>
								<td class="p-2 text-right font-medium sm:p-3">{token.quoteValue}</td>
									<td class="p-2 text-right sm:p-3">{token.trades}</td>
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
