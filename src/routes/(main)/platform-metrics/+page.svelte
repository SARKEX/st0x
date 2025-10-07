<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork, tokenGlobalQuote } from '$lib/stores';
	import Section from '$lib/components/ui/Section.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { getTrades } from '$lib/query';
	import { getAllTokensByNetwork, networks } from '$lib/network';
	import type { SgTrade } from '@rainlanguage/orderbook';
	import type { TradingViewQuote } from '$lib/services/tradingview';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import { env as publicEnv } from '$env/dynamic/public';
	// Consolidated table component usage
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import InfoBlock from '$lib/components/ui/InfoBlock.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	// State for network selector in token trading table
	let selectedNetwork = networks[0];

	// Create a network-agnostic SFTs query to get SFTs from ALL networks
	$: allNetworksSftsQuery = createQuery({
		queryKey: ['metrics-all-networks-sfts'],
		queryFn: async () => {
			const allNetworksSfts: OffchainAssetReceiptVault[] = [];

			// Query each network for SFTs
			for (const network of networks) {
				try {
					if (network.subgraph_url) {
						const { getSfts } = await import('$lib/query');
						const originalNetwork = $currentNetwork;
						$currentNetwork = network;

						try {
							const networkSfts = await getSfts();
							if (networkSfts && Array.isArray(networkSfts)) {
								// Add network info to each SFT
								allNetworksSfts.push(
									...networkSfts.map((sft) => ({
										...sft,
										networkId: network.chainId
									}))
								);
							}
						} finally {
							$currentNetwork = originalNetwork;
						}
					}
				} catch {
					// Continue with other networks even if one fails
				}
			}
			return allNetworksSfts;
		},
		enabled: true,
		retry: 3,
		retryDelay: 1000
	});

	function baseFromSymbol(sym?: string) {
		if (!sym) return undefined;
		if (sym.includes('t')) return sym.split('t')[1];
		return sym;
	}

	function findTradingViewSymbol(symbol?: string) {
		const base = baseFromSymbol(symbol);
		if (!base) return undefined;
		const match = ALL_TOKENS.find(
			(token) => baseFromSymbol(token.symbol)?.toUpperCase() === base.toUpperCase()
		);
		return match?.tradingViewSymbol;
	}

	function findQuoteForSymbol(symbol?: string) {
		if (!$tokenGlobalQuote?.length) return undefined;
		const quotes = $tokenGlobalQuote as TradingViewQuote[];
		const tradingSymbol = findTradingViewSymbol(symbol);
		if (tradingSymbol) {
			const tsUpper = tradingSymbol.toUpperCase();
			const direct = quotes.find((q) => (q.symbol ?? '').toUpperCase() === tsUpper);
			if (direct) return direct;
		}
		const base = baseFromSymbol(symbol)?.toUpperCase();
		if (!base) return undefined;
		return quotes.find((q) => {
			const quoteSymbol = (q.symbol ?? '').toUpperCase();
			if (quoteSymbol === base) return true;
			const parts = quoteSymbol.split(':');
			return parts[parts.length - 1] === base;
		});
	}

	// Get all tokens for logo URLs
	$: ALL_TOKENS = (() => {
		const allTokens: import('$lib/network').CategorizedToken[] = [];
		networks.forEach((network) => {
			const networkTokens = getAllTokensByNetwork(network.chainId);
			allTokens.push(...networkTokens);
		});
		return allTokens.filter(
			(token, index, self) =>
				index === self.findIndex((t) => t.address.toLowerCase() === token.address.toLowerCase())
		);
	})();

	// Query for trades data across ALL networks - last month (30 days)
	$: allNetworksTradesMonthQuery = createQuery({
		queryKey: ['metrics-all-networks-trades-month'],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const monthAgo = now - 30 * 86400; // Last 30 days

			const allNetworksTrades: {
				network: (typeof networks)[0];
				trades: SgTrade[];
				volume: number;
			}[] = [];

			// Query each network for trades
			for (const network of networks) {
				try {
					if (network.orderbook_subgraph_url) {
						const trades = await getTrades(monthAgo, now, network, publicEnv.PUBLIC_SCHWAB_OWNER);
						allNetworksTrades.push({
							network,
							trades,
							volume: 0 // Will be calculated later
						});
					}
				} catch {
					continue;
				}
			}
			return allNetworksTrades;
		},
		enabled: true, // Always enabled since we want data from all networks
		retry: 3,
		retryDelay: 1000
	});

	// Calculate total TVL across all networks
	$: totalTVL = (() => {
		if (!$allNetworksSftsQuery.data) return 0;

		let tlv = 0;
		$allNetworksSftsQuery.data.forEach((sft) => {
			const deposits = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
			const withdraws = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
			const circulating = deposits - withdraws;
			const amount = parseFloat(formatUnits(circulating, 18));

			const tokenInfo = ALL_TOKENS.find(
				(t) => t.address?.toLowerCase() === sft.address?.toLowerCase()
			);

			if (tokenInfo?.symbol) {
				const quote = findQuoteForSymbol(tokenInfo.symbol);
				if (quote?.close != null) {
					tlv += amount * quote.close;
				} else {
					tlv += amount; // Fallback to amount if no price
				}
			} else {
				tlv += amount;
			}
		});
		return tlv;
	})();

	// Calculate trading volume in USD
	$: tradingVolume = (() => {
		if (!$allNetworksTradesMonthQuery.data) return 0;

		let volume = 0;
		$allNetworksTradesMonthQuery.data.forEach((networkData) => {
			networkData.trades.forEach((trade) => {
				// Calculate USD volume from input vault balance change
				if (trade.inputVaultBalanceChange) {
					const inputAmount = Math.abs(
						parseFloat(formatUnits(BigInt(trade.inputVaultBalanceChange.amount || 0), 18))
					);
					const inputTokenAddress = trade.inputVaultBalanceChange.vault?.token?.address;

					if (inputTokenAddress) {
						const tokenInfo = ALL_TOKENS.find(
							(t) => t.address?.toLowerCase() === inputTokenAddress.toLowerCase()
						);

						if (tokenInfo?.symbol) {
							const quote = findQuoteForSymbol(tokenInfo.symbol);
							if (quote?.close != null) {
								volume += inputAmount * quote.close;
							}
						}
					}
				}

				// Calculate USD volume from output vault balance change
				if (trade.outputVaultBalanceChange) {
					const outputAmount = Math.abs(
						parseFloat(formatUnits(BigInt(trade.outputVaultBalanceChange.amount || 0), 18))
					);
					const outputTokenAddress = trade.outputVaultBalanceChange.vault?.token?.address;

					if (outputTokenAddress) {
						const tokenInfo = ALL_TOKENS.find(
							(t) => t.address?.toLowerCase() === outputTokenAddress.toLowerCase()
						);

						if (tokenInfo?.symbol) {
							const quote = findQuoteForSymbol(tokenInfo.symbol);
							if (quote?.close != null) {
								volume += outputAmount * quote.close;
							}
						}
					}
				}
			});
		});
		return volume;
	})();

	// Calculate total trades
	$: totalTrades = (() => {
		if (!$allNetworksTradesMonthQuery.data) return 0;
		return $allNetworksTradesMonthQuery.data.reduce((sum, d) => sum + d.trades.length, 0);
	})();

	// Calculate active ST0x tokens
	$: activeST0x = $allNetworksSftsQuery.data?.length || 0;

	// Calculate stats by network
	$: networkStats = (() => {
		if (!$allNetworksSftsQuery.data || !$allNetworksTradesMonthQuery.data) return [];

		return networks.map((network) => {
			const networkSfts =
				$allNetworksSftsQuery.data?.filter(
					// @ts-expect-error - networkId added dynamically
					(sft) => sft.networkId === network.chainId
				) || [];

			const tradeData = $allNetworksTradesMonthQuery.data?.find(
				(d) => d.network.chainId === network.chainId
			);

			// Calculate network metrics
			let tvl = 0;
			let totalDeposits = BigInt(0);
			let totalWithdraws = BigInt(0);
			let uniqueHolders = new Set<string>();

			networkSfts.forEach((sft) => {
				const deposits = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
				const withdraws = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
				totalDeposits += deposits;
				totalWithdraws += withdraws;

				const circulating = deposits - withdraws;
				const amount = parseFloat(formatUnits(circulating, 18));

				// Calculate TVL
				const tokenInfo = ALL_TOKENS.find(
					(t) => t.address?.toLowerCase() === sft.address?.toLowerCase()
				);
				if (tokenInfo?.symbol) {
					const quote = findQuoteForSymbol(tokenInfo.symbol);
					if (quote?.close != null) {
						tvl += amount * quote.close;
					} else {
						tvl += amount;
					}
				} else {
					tvl += amount;
				}

				// Count unique holders
				sft.tokenHolders.forEach((holder) => uniqueHolders.add(holder.address));
			});

			return {
				network,
				tvl,
				st0xCount: networkSfts.length,
				tokensMinted: formatUnits(totalDeposits, 18),
				tokensRedeemed: formatUnits(totalWithdraws, 18),
				tokensCirculating: formatUnits(totalDeposits - totalWithdraws, 18),
				uniqueAddresses: uniqueHolders.size,
				dayVolume: 0, // Will be calculated separately if needed
				weekVolume: tradeData?.trades.length || 0
			};
		});
	})();

	// Get token trading data for selected network
	$: tokenTradingData = (() => {
		if (!$allNetworksSftsQuery.data || !$allNetworksTradesMonthQuery.data) return [];

		// Filter SFTs by selected network
		const networkSfts = $allNetworksSftsQuery.data.filter(
			// @ts-expect-error - networkId added dynamically
			(sft) => sft.networkId === selectedNetwork.chainId
		);

		// Get trades for selected network
		const networkTrades =
			$allNetworksTradesMonthQuery.data.find((d) => d.network.chainId === selectedNetwork.chainId)
				?.trades || [];

		return networkSfts
			.map((sft) => {
				const tokenInfo = ALL_TOKENS.find(
					(t) => t.address?.toLowerCase() === sft.address?.toLowerCase()
				);

				// Get all trades for this token (both input and output)
				const inputTrades = networkTrades.filter(
					(trade) =>
						trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase() ===
						sft.address?.toLowerCase()
				);
				const outputTrades = networkTrades.filter(
					(trade) =>
						trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase() ===
						sft.address?.toLowerCase()
				);

				// Calculate in volume (tokens offered as input)
				let inVolume = 0;
				inputTrades.forEach((trade) => {
					if (trade.inputVaultBalanceChange) {
						const amount = parseFloat(
							formatUnits(BigInt(trade.inputVaultBalanceChange.amount || 0), 18)
						);
						inVolume += amount;
					}
				});

				// Calculate out volume (tokens offered as output)
				let outVolume = 0;
				outputTrades.forEach((trade) => {
					if (trade.outputVaultBalanceChange) {
						const amount = parseFloat(
							formatUnits(BigInt(trade.outputVaultBalanceChange.amount || 0), 18)
						);
						outVolume += amount;
					}
				});

				// Calculate net volume (out - in)
				const netTradingVolume = outVolume - inVolume;

				// Calculate total volume (sum of in + out, taking absolute values)
				const totalTradingVolume = Math.abs(inVolume) + Math.abs(outVolume);

				// Calculate USD value of total volume
				let usdTradingVolume = 0;
				if (tokenInfo?.symbol) {
					const quote = findQuoteForSymbol(tokenInfo.symbol);
					if (quote?.close != null) {
						usdTradingVolume = totalTradingVolume * quote.close;
					}
				}

				return {
					symbol: sft.symbol,
					name: sft.name,
					logoUrl: tokenInfo?.logoUrl,
					inVolume: inVolume.toFixed(3),
					outVolume: outVolume.toFixed(3),
					netVolume: netTradingVolume.toFixed(3),
					totalVolume: totalTradingVolume.toFixed(3),
					usdValue: usdTradingVolume > 0 ? `$${usdTradingVolume.toFixed(2)}` : 'N/A',
					trades: inputTrades.length + outputTrades.length
				};
			})
			.sort((a, b) => b.trades - a.trades);
	})();
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<PageContainer>
		{#if $allNetworksSftsQuery.isLoading || $allNetworksTradesMonthQuery.isLoading}
			<div class="flex min-h-[60vh] items-center justify-center">
				<LoadingSpinner size="lg" text="Loading metrics..." />
			</div>
		{:else}
			<!-- Multi-Network Notice -->
			<InfoBlock
				variant="info"
				title="Multi-Network Data"
				description="Except where specified, all metrics are cross-network totals."
			/>

			<!-- Top Metrics -->
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<MetricCard
					label="Total Locked Value"
					value={`$${totalTVL.toFixed(2)}`}
					subtitle="All Networks • Live"
					cardClass="bg-gray-800/50 border border-white/10"
					paddingClass="p-6"
					showGradient={false}
					valueClass="text-3xl font-bold"
				/>
				<MetricCard
					label="Trading Volume"
					value={`$${tradingVolume.toFixed(2)}`}
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
					label="Active ST0x"
					value={`${activeST0x}`}
					subtitle="Last 30 days"
					cardClass="bg-gray-800/50 border border-white/10"
					paddingClass="p-6"
					showGradient={false}
					valueClass="text-3xl font-bold"
				/>
			</div>

			<!-- Stats by Network -->
			<Section>
				<div class="mb-6 flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold">Stats by Network</h2>
						<p class="mt-1 text-sm text-gray-400">
							Breakdown of metrics across each supported network • Live data
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
								>Network</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>TVL</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>ST0x</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>Tokens Minted</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>Tokens Redeemed</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>Tokens Circulating</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>Unique Addresses</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>24H Volume</th
							>
							<th
								class="p-2 text-right text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>7D Volume</th
							>
							<th
								class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
								>Status</th
							>
						</tr>
					</thead>
					<tbody>
						{#each networkStats as stats}
							<tr>
								<td class="sticky left-0 bg-gray-800 p-2 sm:p-3 sm:text-sm">
									<div class="flex items-center gap-2 sm:gap-3">
										<img
											src={stats.network.chainId === 42161
												? '/images/ARB.svg'
												: stats.network.chainId === 8453
													? '/images/BASE.svg'
													: '/images/ETH.svg'}
											alt={stats.network.displayName}
											class="h-8 w-8 sm:h-10 sm:w-10"
											class:rounded-full={stats.network.chainId !== 8453}
										/>
										<div class="min-w-0">
											<div class="truncate font-medium">{stats.network.displayName}</div>
											<div class="hidden text-xs text-gray-400 sm:block">{stats.network.name}</div>
										</div>
									</div>
								</td>
								<td class="p-2 text-right text-xs font-medium text-green-400 sm:p-3 sm:text-sm"
									>${stats.tvl.toFixed(2)}</td
								>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">{stats.st0xCount}</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm"
									>{parseFloat(stats.tokensMinted).toFixed(2)}</td
								>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm"
									>{parseFloat(stats.tokensRedeemed).toFixed(2)}</td
								>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm"
									>{parseFloat(stats.tokensCirculating).toFixed(2)}</td
								>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">{stats.uniqueAddresses}</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">{stats.dayVolume}</td>
								<td class="p-2 text-right text-xs sm:p-3 sm:text-sm">{stats.weekVolume}</td>
								<td class="p-2 text-center text-xs sm:p-3 sm:text-sm">
									<div class="flex items-center justify-center gap-1 sm:gap-2">
										<div class="h-2 w-2 rounded-full bg-green-400"></div>
										<span class="hidden text-xs text-green-400 sm:inline">Active</span>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</Table>
			</Section>

			<!-- Token Trading Volumes -->
			<Section>
				<div class="mb-6">
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<h2 class="text-xl font-semibold">Token Trading Volumes</h2>
							<p class="mt-1 text-sm text-gray-400">
								Trading activity for tokens on selected network
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

				{#if tokenTradingData.length > 0}
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead>
								<tr
									class="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-gray-400"
								>
									<th class="sticky left-0 z-10 bg-gray-800 p-2 sm:p-3">Token</th>
									<th class="p-2 text-right sm:p-3">In Volume</th>
									<th class="p-2 text-right sm:p-3">Out Volume</th>
									<th class="p-2 text-right sm:p-3">Net Volume</th>
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
													<img
														src={token.logoUrl}
														alt={token.symbol}
														class="h-8 w-8 rounded-full"
													/>
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
										<td class="p-2 text-right sm:p-3">{parseFloat(token.inVolume).toFixed(3)}</td>
										<td class="p-2 text-right sm:p-3">{parseFloat(token.outVolume).toFixed(3)}</td>
										<td
											class="p-2 text-right sm:p-3 {parseFloat(token.netVolume) >= 0
												? 'text-green-400'
												: 'text-red-400'}"
										>
											{parseFloat(token.netVolume).toFixed(3)}
										</td>
										<td class="p-2 text-right text-yellow-400 sm:p-3"
											>{parseFloat(token.totalVolume).toFixed(3)}</td
										>
										<td class="p-2 text-right font-medium sm:p-3">{token.usdValue}</td>
										<td class="p-2 text-right sm:p-3">{token.trades}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<EmptyState
						description="No trading data available for {selectedNetwork.displayName}"
						showBorder={true}
					/>
				{/if}
			</Section>
		{/if}
	</PageContainer>

	<Footer />
</div>
