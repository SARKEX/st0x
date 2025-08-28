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
	import { InfoCircleSolid } from 'flowbite-svelte-icons';

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
				(t) => t.address?.toLowerCase() === sft.receipt?.address?.toLowerCase()
			);

			if (tokenInfo?.ticker) {
				const quote = $tokenGlobalQuote[tokenInfo.ticker] as ApiStockQuote;
				if (quote?.['05. price']) {
					tlv += amount * parseFloat(quote['05. price']);
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
					t => t.address?.toLowerCase() === sft.receipt?.address?.toLowerCase()
				);
				if (tokenInfo?.ticker) {
					const quote = $tokenGlobalQuote[tokenInfo.ticker] as ApiStockQuote;
					if (quote?.['05. price']) {
						tvl += amount * parseFloat(quote['05. price']);
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
		
		// @ts-ignore - networkId added dynamically
		const networkSfts = $allNetworksSftsQuery.data.filter(
			sft => sft.networkId === selectedNetwork.chainId
		);
		
		return networkSfts.map(sft => {
			const deposits = sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0));
			const withdraws = sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0));
			const netVolume = deposits - withdraws;
			
			const tokenInfo = ALL_TOKENS.find(
				t => t.address?.toLowerCase() === sft.receipt?.address?.toLowerCase()
			);
			
			let usdValue = 'N/A';
			const amount = parseFloat(formatUnits(deposits, 18));
			if (tokenInfo?.ticker) {
				const quote = $tokenGlobalQuote[tokenInfo.ticker] as ApiStockQuote;
				if (quote?.['05. price']) {
					const value = amount * parseFloat(quote['05. price']);
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
	<div class="space-y-6 p-3 sm:space-y-8 sm:p-6">
		<!-- Multi-Network Notice -->
		<div class="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
			<InfoCircleSolid class="mt-0.5 h-5 w-5 text-blue-400" />
			<div>
				<div class="font-medium text-blue-400">Multi-Network Data</div>
				<div class="mt-1 text-sm text-gray-300">
					Except where specified, all metrics are cross-network totals.
				</div>
			</div>
		</div>

		<!-- Top Metrics -->
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div class="rounded-lg border border-white/10 bg-gray-800/50 p-6">
				<div class="text-xs font-medium uppercase tracking-wide text-gray-400">Total Locked Value</div>
				<div class="mt-3 text-3xl font-bold">${totalTVL.toFixed(2)}</div>
				<div class="mt-2 text-sm text-gray-500">All Networks • Live</div>
			</div>
			<div class="rounded-lg border border-white/10 bg-gray-800/50 p-6">
				<div class="text-xs font-medium uppercase tracking-wide text-gray-400">Trading Volume</div>
				<div class="mt-3 text-3xl font-bold">${tradingVolume.toFixed(2)}</div>
				<div class="mt-2 text-sm text-gray-500">Last 30 days</div>
			</div>
			<div class="rounded-lg border border-white/10 bg-gray-800/50 p-6">
				<div class="text-xs font-medium uppercase tracking-wide text-gray-400">Total Trades</div>
				<div class="mt-3 text-3xl font-bold">{totalTrades}</div>
				<div class="mt-2 text-sm text-gray-500">Last 30 days</div>
			</div>
			<div class="rounded-lg border border-white/10 bg-gray-800/50 p-6">
				<div class="text-xs font-medium uppercase tracking-wide text-gray-400">Active ST0x</div>
				<div class="mt-3 text-3xl font-bold">{activeST0x}</div>
				<div class="mt-2 text-sm text-gray-500">Last 30 days</div>
			</div>
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
			
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead>
						<tr class="border-b border-white/10 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
							<th class="p-3">Network</th>
							<th class="p-3 text-right">TVL</th>
							<th class="p-3 text-right">ST0x</th>
							<th class="p-3 text-right">Tokens Minted</th>
							<th class="p-3 text-right">Tokens Redeemed</th>
							<th class="p-3 text-right">Tokens Circulating</th>
							<th class="p-3 text-right">Unique Addresses</th>
							<th class="p-3 text-right">24H Volume</th>
							<th class="p-3 text-right">7D Volume</th>
							<th class="p-3 text-center">Status</th>
						</tr>
					</thead>
					<tbody>
						{#each networkStats as stats}
							<tr class="border-b border-white/5 hover:bg-white/5">
								<td class="p-3">
									<div class="flex items-center gap-3">
										<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-800 text-lg font-bold">
											{stats.network.displayName.charAt(0)}
										</div>
										<div>
											<div class="font-medium">{stats.network.displayName}</div>
											<div class="text-xs text-gray-400">{stats.network.name}</div>
										</div>
									</div>
								</td>
								<td class="p-3 text-right font-medium text-green-400">${stats.tvl.toFixed(2)}</td>
								<td class="p-3 text-right">{stats.st0xCount}</td>
								<td class="p-3 text-right">{parseFloat(stats.tokensMinted).toFixed(2)}</td>
								<td class="p-3 text-right">{parseFloat(stats.tokensRedeemed).toFixed(2)}</td>
								<td class="p-3 text-right">{parseFloat(stats.tokensCirculating).toFixed(2)}</td>
								<td class="p-3 text-right">{stats.uniqueAddresses}</td>
								<td class="p-3 text-right">{stats.dayVolume}</td>
								<td class="p-3 text-right">{stats.weekVolume}</td>
								<td class="p-3">
									<div class="flex items-center justify-center gap-2">
										<div class="h-2 w-2 rounded-full bg-green-400"></div>
										<span class="text-xs text-green-400">Active</span>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
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
				<div class="rounded-lg border border-white/10 bg-gray-800/50 p-8 text-center">
					<p class="text-gray-400">No trading data available for {selectedNetwork.displayName}</p>
				</div>
			{/if}
		</Section>
	</div>

	<Footer />
</div>