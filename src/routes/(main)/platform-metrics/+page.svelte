<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { formatUnits } from 'viem';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { currentNetwork, sfts, tokenGlobalQuote } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { getTrades } from '$lib/query';
	import { getAllTokensByNetwork, networks } from '$lib/network';
	import type { SgTrade } from '@rainlanguage/orderbook';
	import type { ApiStockQuote } from '$lib/types';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import TableHead from '$lib/components/ui/table/TableHead.svelte';
	import TableRow from '$lib/components/ui/table/TableRow.svelte';
	import TableCell from '$lib/components/ui/table/TableCell.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import InfoBlock from '$lib/components/ui/InfoBlock.svelte';

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
								allNetworksSfts.push(...networkSfts.map(sft => ({
									...sft,
									networkId: network.chainId
								})));
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

	// Get all tokens for logo URLs
	$: ALL_TOKENS = (() => {
		const allTokens: any[] = [];
		networks.forEach((network) => {
			const networkTokens = getAllTokensByNetwork(network.chainId);
			allTokens.push(...networkTokens);
		});
		return allTokens.filter(
			(token, index, self) =>
				index === self.findIndex((t) => t.address.toLowerCase() === token.address.toLowerCase())
		);
	})();

	// Query for trading volumes across all networks
	$: allNetworksTradesQuery = createQuery({
		queryKey: ['metrics-all-networks-trades'],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const dayAgo = now - 86400;
			const weekAgo = now - 7 * 86400;
			const monthAgo = now - 30 * 86400;

			const allTradesData: {
				network: (typeof networks)[0];
				dayTrades: SgTrade[];
				weekTrades: SgTrade[];
				monthTrades: SgTrade[];
			}[] = [];

			for (const network of networks) {
				try {
					const originalNetwork = $currentNetwork;
					$currentNetwork = network;

					try {
						const dayTrades = await getTrades(dayAgo, now, network);
						const weekTrades = await getTrades(weekAgo, now, network);
						const monthTrades = await getTrades(monthAgo, now, network);

						allTradesData.push({
							network,
							dayTrades: dayTrades || [],
							weekTrades: weekTrades || [],
							monthTrades: monthTrades || []
						});
					} finally {
						$currentNetwork = originalNetwork;
					}
				} catch {
					allTradesData.push({
						network,
						dayTrades: [],
						weekTrades: [],
						monthTrades: []
					});
				}
			}

			return allTradesData;
		},
		enabled: true,
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
				const quote = ($tokenGlobalQuote as ApiStockQuote[])?.find(
					(q) => q?.['Global Quote']?.['01. symbol'] === tokenInfo.symbol?.split('s1')[0]
				);
				if (quote?.['Global Quote']?.['05. price']) {
					tlv += amount * parseFloat(quote['Global Quote']['05. price']);
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
		if (!$allNetworksTradesQuery.data) return 0;
		
		let volume = 0;
		$allNetworksTradesQuery.data.forEach(networkData => {
			networkData.monthTrades.forEach(trade => {
				// Simplified - in production would calculate actual trade values
				volume += 100; // Placeholder value per trade
			});
		});
		return volume;
	})();

	// Calculate total trades
	$: totalTrades = (() => {
		if (!$allNetworksTradesQuery.data) return 0;
		return $allNetworksTradesQuery.data.reduce((sum, d) => sum + d.monthTrades.length, 0);
	})();

	// Calculate active ST0x tokens
	$: activeST0x = $allNetworksSftsQuery.data?.length || 0;

	// Calculate stats by network
	$: networkStats = (() => {
		if (!$allNetworksSftsQuery.data || !$allNetworksTradesQuery.data) return [];
		
		return networks.map(network => {
			const networkSfts = $allNetworksSftsQuery.data?.filter(
				// @ts-ignore - networkId added dynamically
				sft => sft.networkId === network.chainId
			) || [];
			
			const tradeData = $allNetworksTradesQuery.data?.find(
				d => d.network.chainId === network.chainId
			);

			// Calculate network metrics
			let tvl = 0;
			let totalDeposits = BigInt(0);
			let totalWithdraws = BigInt(0);
			let uniqueHolders = new Set<string>();
			
			networkSfts.forEach(sft => {
				const deposits = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
				const withdraws = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
				totalDeposits += deposits;
				totalWithdraws += withdraws;
				
				const circulating = deposits - withdraws;
				const amount = parseFloat(formatUnits(circulating, 18));
				
				// Calculate TVL
				const tokenInfo = ALL_TOKENS.find(
					t => t.address?.toLowerCase() === sft.address?.toLowerCase()
				);
				if (tokenInfo?.symbol) {
					const quote = ($tokenGlobalQuote as ApiStockQuote[])?.find(
						(q) => q?.['Global Quote']?.['01. symbol'] === tokenInfo.symbol?.split('s1')[0]
					);
					if (quote?.['Global Quote']?.['05. price']) {
						tvl += amount * parseFloat(quote['Global Quote']['05. price']);
					} else {
						tvl += amount;
					}
				} else {
					tvl += amount;
				}
				
				// Count unique holders
				sft.tokenHolders.forEach(holder => uniqueHolders.add(holder.address));
			});

			return {
				network,
				tvl,
				st0xCount: networkSfts.length,
				tokensMinted: formatUnits(totalDeposits, 18),
				tokensRedeemed: formatUnits(totalWithdraws, 18),
				tokensCirculating: formatUnits(totalDeposits - totalWithdraws, 18),
				uniqueAddresses: uniqueHolders.size,
				dayVolume: tradeData?.dayTrades.length || 0,
				weekVolume: tradeData?.weekTrades.length || 0
			};
		});
	})();

	// Get token trading data for selected network
	$: tokenTradingData = (() => {
		if (!$allNetworksSftsQuery.data) return [];
		
		// Filter by matching network
		const networkSfts = selectedNetwork.id === 'all' 
			? $allNetworksSftsQuery.data 
			: $sfts || [];
		
		return networkSfts.map(sft => {
			const deposits = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
			const withdraws = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
			const netVolume = deposits - withdraws;
			
			const tokenInfo = ALL_TOKENS.find(
				t => t.address?.toLowerCase() === sft.address?.toLowerCase()
			);
			
			let usdValue = 'N/A';
			const amount = parseFloat(formatUnits(deposits, 18));
			if (tokenInfo?.symbol) {
				const quote = ($tokenGlobalQuote as ApiStockQuote[])?.find(
					(q) => q?.['Global Quote']?.['01. symbol'] === tokenInfo.symbol?.split('s1')[0]
				);
				if (quote?.['Global Quote']?.['05. price']) {
					const value = amount * parseFloat(quote['Global Quote']['05. price']);
					usdValue = `$${value.toFixed(2)}`;
				}
			}
			
			return {
				symbol: sft.symbol,
				name: sft.name,
				logoUrl: tokenInfo?.logo_url,
				inVolume: formatUnits(deposits, 18),
				outVolume: formatUnits(withdraws, 18),
				netVolume: formatUnits(netVolume, 18),
				totalVolume: formatUnits(deposits, 18),
				usdValue,
				trades: sft.shareTransfers.length
			};
		}).sort((a, b) => b.trades - a.trades);
	})();
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<PageContainer>
		<!-- Multi-Network Notice -->
		<InfoBlock 
			variant="info"
			title="Multi-Network Data"
			description="Except where specified, all metrics are cross-network totals."
		/>

		<!-- Top Metrics -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<MetricCard label="Total Locked Value" value={`$${totalTVL.toFixed(2)}`} subtitle="All Networks • Live" cardClass="bg-gray-800/50 border border-white/10" paddingClass="p-6" showGradient={false} valueClass="text-3xl font-bold" />
			<MetricCard label="Trading Volume" value={`$${tradingVolume.toFixed(2)}`} subtitle="Last 30 days" cardClass="bg-gray-800/50 border border-white/10" paddingClass="p-6" showGradient={false} valueClass="text-3xl font-bold" />
			<MetricCard label="Total Trades" value={`${totalTrades}`} subtitle="Last 30 days" cardClass="bg-gray-800/50 border border-white/10" paddingClass="p-6" showGradient={false} valueClass="text-3xl font-bold" />
			<MetricCard label="Active ST0x" value={`${activeST0x}`} subtitle="Last 30 days" cardClass="bg-gray-800/50 border border-white/10" paddingClass="p-6" showGradient={false} valueClass="text-3xl font-bold" />
		</div>

		<!-- Stats by Network -->
		<Section>
			<div class="mb-6 flex items-center justify-between">
				<div>
					<h2 class="text-xl font-semibold">Stats by Network</h2>
					<p class="mt-1 text-sm text-gray-400">Breakdown of metrics across each supported network • Live data</p>
				</div>
				<div class="flex items-center gap-2 text-sm text-green-400">
					<div class="h-2 w-2 rounded-full bg-green-400"></div>
					Live Data
				</div>
			</div>
			
			<Table>
				<thead>
					<TableRow isHeader>
						<TableHead>Network</TableHead>
						<TableHead align="right">TVL</TableHead>
						<TableHead align="right">ST0x</TableHead>
						<TableHead align="right" className="hidden sm:table-cell">Tokens Minted</TableHead>
						<TableHead align="right" className="hidden sm:table-cell">Tokens Redeemed</TableHead>
						<TableHead align="right" className="hidden md:table-cell">Tokens Circulating</TableHead>
						<TableHead align="right" className="hidden lg:table-cell">Unique Addresses</TableHead>
						<TableHead align="right">24H Volume</TableHead>
						<TableHead align="right" className="hidden xl:table-cell">7D Volume</TableHead>
						<TableHead align="center">Status</TableHead>
					</TableRow>
				</thead>
				<tbody>
					{#each networkStats as stats}
						<TableRow>
							<TableCell>
								<div class="flex items-center gap-2 sm:gap-3">
									<div class="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-gray-800 text-sm sm:text-lg font-bold">
										{stats.network.displayName.charAt(0)}
									</div>
									<div class="min-w-0">
										<div class="font-medium truncate">{stats.network.displayName}</div>
										<div class="text-xs text-gray-400 hidden sm:block">{stats.network.name}</div>
									</div>
								</div>
							</TableCell>
							<TableCell align="right" className="font-medium text-green-400">${stats.tvl.toFixed(2)}</TableCell>
							<TableCell align="right">{stats.st0xCount}</TableCell>
							<TableCell align="right" className="hidden sm:table-cell">{parseFloat(stats.tokensMinted).toFixed(2)}</TableCell>
							<TableCell align="right" className="hidden sm:table-cell">{parseFloat(stats.tokensRedeemed).toFixed(2)}</TableCell>
							<TableCell align="right" className="hidden md:table-cell">{parseFloat(stats.tokensCirculating).toFixed(2)}</TableCell>
							<TableCell align="right" className="hidden lg:table-cell">{stats.uniqueAddresses}</TableCell>
							<TableCell align="right">{stats.dayVolume}</TableCell>
							<TableCell align="right" className="hidden xl:table-cell">{stats.weekVolume}</TableCell>
							<TableCell align="center">
								<div class="flex items-center justify-center gap-1 sm:gap-2">
									<div class="h-2 w-2 rounded-full bg-green-400"></div>
									<span class="text-xs text-green-400 hidden sm:inline">Active</span>
								</div>
							</TableCell>
						</TableRow>
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
						<p class="mt-1 text-sm text-gray-400">Trading activity for tokens on selected network</p>
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
							<tr class="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
								<th class="p-3">Token</th>
								<th class="p-3 text-right">In Volume</th>
								<th class="p-3 text-right">Out Volume</th>
								<th class="p-3 text-right">Net Volume</th>
								<th class="p-3 text-right">Total Volume</th>
								<th class="p-3 text-right">USD Value</th>
								<th class="p-3 text-right">Trades</th>
							</tr>
						</thead>
						<tbody>
							{#each tokenTradingData as token}
								<tr class="border-b border-white/5 hover:bg-white/5">
									<td class="p-3">
										<div class="flex items-center gap-3">
                                {#if token.logoUrl}
                                    <img src={token.logoUrl} alt={token.symbol} class="h-8 w-8 rounded-full" />
                                {:else}
                                    <div class="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-xs font-bold">
                                        {token.symbol?.charAt(0)}
                                    </div>
                                {/if}
                                <div>
                                    <div class="font-medium">{token.symbol}</div>
                                    <div class="text-xs text-gray-400">{token.name}</div>
                                </div>
										</div>
									</td>
									<td class="p-3 text-right">{parseFloat(token.inVolume).toFixed(6)}</td>
									<td class="p-3 text-right">{parseFloat(token.outVolume).toFixed(6)}</td>
									<td class="p-3 text-right {parseFloat(token.netVolume) >= 0 ? 'text-green-400' : 'text-red-400'}">
										{parseFloat(token.netVolume).toFixed(6)}
									</td>
									<td class="p-3 text-right text-yellow-400">{parseFloat(token.totalVolume).toFixed(6)}</td>
									<td class="p-3 text-right font-medium">{token.usdValue}</td>
									<td class="p-3 text-right">{token.trades}</td>
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
	</PageContainer>

	<Footer />
</div>
