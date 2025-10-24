<script lang="ts">
        import Footer from '$lib/components/Footer.svelte';
        import { formatUnits } from 'viem';
        import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
        import Section from '$lib/components/ui/Section.svelte';
        import { getAllTokensByNetwork, networks } from '$lib/network';
import type { TradingViewQuote } from '$lib/services/tradingview';
import PageContainer from '$lib/components/ui/PageContainer.svelte';
import MetricCard from '$lib/components/ui/MetricCard.svelte';
import Table from '$lib/components/ui/table/Table.svelte';
// Consolidated table component usage
import EmptyState from '$lib/components/ui/EmptyState.svelte';
import InfoBlock from '$lib/components/ui/InfoBlock.svelte';
import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
import { derived } from 'svelte/store';
import { onMount } from 'svelte';
import {
                getResourceStore,
                ensureResource,
                type TimedResource,
                type TradeMetricPayload
        } from '$lib/stores/network-data-cache';
import { findQuoteForSymbol } from '$lib/utils/tokenQuotes';

        // State for network selector in token trading table
        let selectedNetwork = networks[0];

        const vaultResourceStores = networks.map((network) =>
                getResourceStore(network.id, 'vaultSnapshot')
        );
        const priceFeedResourceStores = networks.map((network) =>
                getResourceStore(network.id, 'priceFeeds')
        );
        const tradeResourceStores = networks.map((network) =>
                getResourceStore(network.id, 'tradeActivity')
        );

        const allVaultResources = derived(
                vaultResourceStores,
                (resources) => resources,
                vaultResourceStores.map(() => null as TimedResource<OffchainAssetReceiptVault[]> | null)
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

        onMount(() => {
                networks.forEach((network) => {
                        ensureResource(network.id, 'vaultSnapshot');
                        ensureResource(network.id, 'priceFeeds');
                        ensureResource(network.id, 'tradeActivity');
                });
        });

        $: vaultStates = networks.map((network, index) => ({
                network,
                resource: $allVaultResources[index]
        }));

        $: priceFeedStates = networks.map((network, index) => ({
                network,
                resource: $allPriceFeedResources[index]
        }));

        $: tradeStates = networks.map((network, index) => ({
                network,
                resource: $allTradeResources[index]
        }));

        let priceFeedByNetwork = new Map<number, TradingViewQuote[]>();
        $: priceFeedByNetwork = (() => {
                const map = new Map<number, TradingViewQuote[]>();
                priceFeedStates.forEach(({ network, resource }) => {
                        map.set(network.chainId, resource?.data ?? []);
                });
                return map;
        })();

        $: allNetworksSfts = (() => {
                const aggregated: (OffchainAssetReceiptVault & { networkId: number })[] = [];
                vaultStates.forEach(({ network, resource }) => {
                        (resource?.data ?? []).forEach((sft) => {
                                aggregated.push({ ...sft, networkId: network.chainId });
                        });
                });
                return aggregated;
        })();

        $: allNetworksTrades = tradeStates.map(({ network, resource }) => ({
                network,
                trades: resource?.data?.trades ?? [],
                range: resource?.data?.range,
                status: resource?.status ?? 'idle'
        }));

        function findNetworkQuote(symbol?: string, networkId?: number) {
                if (networkId == null) return undefined;
                const quotes = priceFeedByNetwork.get(networkId) ?? [];
                if (!quotes.length) return undefined;
                return findQuoteForSymbol(symbol, quotes, ALL_TOKENS);
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

        // Calculate total TVL across all networks
        $: totalTVL = (() => {
                if (!allNetworksSfts.length) return 0;

                let tlv = 0;
                allNetworksSfts.forEach((sft) => {
                        const deposits = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
                        const withdraws = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
                        const circulating = deposits - withdraws;
                        const amount = parseFloat(formatUnits(circulating, 18));

                        const tokenInfo = ALL_TOKENS.find(
                                (t) => t.address?.toLowerCase() === sft.address?.toLowerCase()
                        );

                        if (tokenInfo?.symbol) {
                                const quote = findNetworkQuote(tokenInfo.symbol, sft.networkId);
                                if (quote?.close != null) {
                                        tlv += amount * quote.close;
                                } else {
                                        tlv += amount;
                                }
                        } else {
                                tlv += amount;
                        }
                });
                return tlv;
        })();

        // Calculate trading volume in USD (total volume from unique trades)
        $: tradingVolume = (() => {
                if (!allNetworksTrades.length) return 0;

                let volume = 0;
                allNetworksTrades.forEach(({ network, trades }) => {
                        const uniqueTrades = trades.filter(
                                (trade, index, self) =>
                                        index ===
                                        self.findIndex((t) => t.tradeEvent?.transaction?.id === trade.tradeEvent?.transaction?.id)
                        );

                        uniqueTrades.forEach((trade) => {
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
                                                        const quote = findNetworkQuote(tokenInfo.symbol, network.chainId);
                                                        if (quote?.close != null) {
                                                                volume += inputAmount * quote.close;
                                                        }
                                                }
                                        }
                                }

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
                                                        const quote = findNetworkQuote(tokenInfo.symbol, network.chainId);
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
        $: totalTrades = allNetworksTrades.reduce((sum, d) => sum + d.trades.length, 0);

        // Calculate active ST0x tokens
        $: activeST0x = allNetworksSfts.length;

        function isVaultPending(resource: TimedResource<OffchainAssetReceiptVault[]> | null | undefined) {
                const count = resource?.data?.length ?? 0;
                return !resource || resource.status === 'idle' || (resource.status === 'loading' && count === 0);
        }

        function isTradePending(resource: TimedResource<TradeMetricPayload> | null | undefined) {
                const count = resource?.data?.trades?.length ?? 0;
                return !resource || resource.status === 'idle' || (resource.status === 'loading' && count === 0);
        }

        $: vaultLoading = vaultStates.some(({ resource }) => isVaultPending(resource));
        $: tradeLoading = tradeStates.some(({ resource }) => isTradePending(resource));
        $: metricsLoading = vaultLoading || tradeLoading;

        // Calculate stats by network
        $: networkStats = networks.map((network) => {
                const networkSfts = allNetworksSfts.filter((sft) => sft.networkId === network.chainId);

                let tvl = 0;
                let totalDeposits = BigInt(0);
                let totalWithdraws = BigInt(0);
                const uniqueHolders = new Set<string>();

                networkSfts.forEach((sft) => {
                        const deposits = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
                        const withdraws = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
                        totalDeposits += deposits;
                        totalWithdraws += withdraws;

                        const circulating = deposits - withdraws;
                        const amount = parseFloat(formatUnits(circulating, 18));

                        const tokenInfo = ALL_TOKENS.find(
                                (t) => t.address?.toLowerCase() === sft.address?.toLowerCase()
                        );
                        if (tokenInfo?.symbol) {
                                const quote = findNetworkQuote(tokenInfo.symbol, network.chainId);
                                if (quote?.close != null) {
                                        tvl += amount * quote.close;
                                } else {
                                        tvl += amount;
                                }
                        } else {
                                tvl += amount;
                        }

                        sft.tokenHolders.forEach((holder) => {
                                if (BigInt(holder.balance) > BigInt(0)) {
                                        uniqueHolders.add(holder.address);
                                }
                        });
                });

                return {
                        network,
                        tvl,
                        st0xCount: networkSfts.length,
                        tokensMinted: formatUnits(totalDeposits, 18),
                        tokensRedeemed: formatUnits(totalWithdraws, 18),
                        tokensCirculating: formatUnits(totalDeposits - totalWithdraws, 18),
                        uniqueAddresses: uniqueHolders.size
                };
        });

        // Get token trading data for selected network
        $: tokenTradingData = (() => {
                const networkSfts = allNetworksSfts.filter((sft) => sft.networkId === selectedNetwork.chainId);
                const networkTrades =
                        allNetworksTrades.find((d) => d.network.chainId === selectedNetwork.chainId)?.trades || [];

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

				// Calculate in volume (tokens received - always positive)
				let inVolume = 0;
				inputTrades.forEach((trade) => {
					if (trade.inputVaultBalanceChange) {
						const amount = parseFloat(
							formatUnits(BigInt(trade.inputVaultBalanceChange.amount || 0), 18)
						);
						inVolume += Math.abs(amount); // Always positive
					}
				});

				// Calculate out volume (tokens sent - always positive)
				let outVolume = 0;
				outputTrades.forEach((trade) => {
					if (trade.outputVaultBalanceChange) {
						const amount = parseFloat(
							formatUnits(BigInt(trade.outputVaultBalanceChange.amount || 0), 18)
						);
						outVolume += Math.abs(amount); // Always positive
					}
				});

				// Calculate net volume (in - out, can be negative)
				const netTradingVolume = inVolume - outVolume;

				// Get all unique trades for this token (filter by transaction ID to avoid double counting)
				const allTokenTrades = networkTrades.filter(
					(trade) =>
						trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase() ===
							sft.address?.toLowerCase() ||
						trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase() ===
							sft.address?.toLowerCase()
				);

				const uniqueTokenTrades = allTokenTrades.filter(
					(trade, index, self) =>
						index ===
						self.findIndex(
							(t) => t.tradeEvent?.transaction?.id === trade.tradeEvent?.transaction?.id
						)
				);

				// Calculate total volume (sum of unique trade amounts)
				let totalTradingVolume = 0;
				uniqueTokenTrades.forEach((trade) => {
					// Add input amount if this token is the input
					if (
						trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase() ===
						sft.address?.toLowerCase()
					) {
						const amount = parseFloat(
							formatUnits(BigInt(trade.inputVaultBalanceChange.amount || 0), 18)
						);
						totalTradingVolume += Math.abs(amount);
					}
					// Add output amount if this token is the output
					if (
						trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase() ===
						sft.address?.toLowerCase()
					) {
						const amount = parseFloat(
							formatUnits(BigInt(trade.outputVaultBalanceChange.amount || 0), 18)
						);
						totalTradingVolume += Math.abs(amount);
					}
				});

				// Calculate USD value of total volume
				let usdTradingVolume = 0;
                                if (tokenInfo?.symbol) {
                                        const quote = findNetworkQuote(tokenInfo.symbol, selectedNetwork.chainId);
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
					trades: uniqueTokenTrades.length
				};
			})
			.sort((a, b) => b.trades - a.trades);
	})();
</script>

<div class="min-h-screen bg-gray-900 text-white">
        <PageContainer>
                {#if metricsLoading}
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
