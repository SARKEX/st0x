<script lang="ts">
	import { currentNetwork, tokenGlobalQuote } from '$lib/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import { getTrades } from '$lib/query';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { getAllTokensByNetwork, networks } from '$lib/network';
	import type { SgTrade } from '@rainlanguage/orderbook';
	import type { ApiStockQuote } from '$lib/types';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { getVaults } from '@rainlanguage/orderbook';
	import type { SgVaultWithSubgraphName } from '@rainlanguage/orderbook';

	// Create a network-agnostic SFTs query to get SFTs from ALL networks
	$: allNetworksSftsQuery = createQuery({
		queryKey: ['metrics-all-networks-sfts'],
		queryFn: async () => {
			const allNetworksSfts: OffchainAssetReceiptVault[] = [];

			// Query each network for SFTs
			for (const network of networks) {
				try {
					if (network.subgraph_url) {
						// Import getSfts dynamically to avoid circular dependency
						const { getSfts } = await import('$lib/query');
						// Temporarily set currentNetwork to this network to get SFTs
						const originalNetwork = $currentNetwork;
						$currentNetwork = network;

						try {
							const networkSfts = await getSfts();
							if (networkSfts && Array.isArray(networkSfts)) {
								allNetworksSfts.push(...networkSfts);
							}
						} finally {
							// Restore original network
							$currentNetwork = originalNetwork;
						}
					}
				} catch {
					// Continue with other networks even if one fails
				}
			}
			return allNetworksSfts;
		},
		enabled: true, // Always enabled since we want data from all networks
		retry: 3,
		retryDelay: 1000
	});

	// Get all tokens for logo URLs - combine tokens from ALL networks, not just current network
	$: ALL_TOKENS = (() => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const allTokens: any[] = [];
		networks.forEach((network) => {
			const networkTokens = getAllTokensByNetwork(network.chainId);
			allTokens.push(...networkTokens);
		});
		// Remove duplicates based on address
		return allTokens.filter(
			(token, index, self) =>
				index === self.findIndex((t) => t.address.toLowerCase() === token.address.toLowerCase())
		);
	})();

	// Query for vault balances across ALL networks
	$: allNetworksVaultsQuery = createQuery({
		queryKey: ['metrics-all-networks-vaults'],
		queryFn: async () => {
			const allNetworksData: {
				network: (typeof networks)[0];
				vaults: SgVaultWithSubgraphName[];
				tlv: number;
			}[] = [];

			// Query each network for vaults
			for (const network of networks) {
				try {
					// Collect all orderbook subgraph URLs (active + inactive) for this network
					const allOrderbookUrls: string[] = [];

					// Add active URL if it exists
					if (network.orderbook_subgraph_url) {
						allOrderbookUrls.push(network.orderbook_subgraph_url);
					}

					// Add inactive URLs if they exist
					if (
						network.orderbook_subgraph_urls_inactive &&
						network.orderbook_subgraph_urls_inactive.length > 0
					) {
						allOrderbookUrls.push(...network.orderbook_subgraph_urls_inactive);
					}

					// If no URLs available, skip this network
					if (allOrderbookUrls.length === 0) continue;

					let networkVaults: SgVaultWithSubgraphName[] = [];

					// Query each subgraph for vaults
					for (const subgraphUrl of allOrderbookUrls) {
						try {
							let page = 1;
							const pageSize = 1000;
							let hasMore = true;

							// Fetch all vaults by paginating through all pages for this subgraph
							while (hasMore) {
								const vaultsResult = await getVaults(
									[
										{
											url: subgraphUrl,
											name: network.raindexNetworkSlug
										}
									],
									{
										owners: [],
										hideZeroBalance: false
									},
									{ page, pageSize }
								);

								if (vaultsResult.error) {
									break; // Skip this subgraph if it fails
								}

								const vaults = vaultsResult.value;
								networkVaults.push(...vaults);

								// Check if there are more pages
								hasMore = vaults.length === pageSize;
								page++;
							}
						} catch {
							// Continue with other subgraphs even if one fails
						}
					}

					// Remove duplicate vaults based on vault ID (in case same vault exists in multiple subgraphs)
					const uniqueVaults = networkVaults.filter(
						(vault, index, self) => index === self.findIndex((v) => v.vault.id === vault.vault.id)
					);

					allNetworksData.push({
						network,
						vaults: uniqueVaults,
						tlv: 0 // Will be calculated later
					});
				} catch {
					continue;
				}
			}

			return allNetworksData;
		},
		enabled: true, // Always enabled since we want data from all networks
		retry: 3,
		retryDelay: 1000
	});

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
						const trades = await getTrades(monthAgo, now, network);
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

	// Query for trades data across ALL networks - last week (7 days)
	$: allNetworksTradesWeekQuery = createQuery({
		queryKey: ['metrics-all-networks-trades-week'],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const weekAgo = now - 7 * 86400; // Last 7 days

			const allNetworksTrades: {
				network: (typeof networks)[0];
				trades: SgTrade[];
				volume: number;
			}[] = [];

			// Query each network for trades
			for (const network of networks) {
				try {
					if (network.orderbook_subgraph_url) {
						const trades = await getTrades(weekAgo, now, network);
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

	// Calculate Total Locked Value (TLV) across all networks - COMPLETELY network-agnostic
	$: allNetworksTlv = (() => {
		if (
			!$allNetworksVaultsQuery.data ||
			!$tokenGlobalQuote.length ||
			!$allNetworksSftsQuery.data ||
			$allNetworksSftsQuery.data.length === 0
		)
			return [];

		return $allNetworksVaultsQuery.data.map((networkData) => {
			// Group vaults by token to calculate total balances for this network
			const tokenMap = new Map<
				string,
				{
					sft: OffchainAssetReceiptVault;
					totalBalance: bigint;
					vaultCount: number;
				}
			>();

			// Initialize all SFTS with zero balance
			$allNetworksSftsQuery.data.forEach((sft) => {
				tokenMap.set(sft.address.toLowerCase(), {
					sft,
					totalBalance: 0n,
					vaultCount: 0
				});
			});

			// Sum up balances from all vaults for this network
			networkData.vaults.forEach((vaultData: SgVaultWithSubgraphName) => {
				const vault = vaultData.vault;
				const tokenAddress = vault.token.id.toLowerCase();

				if (tokenMap.has(tokenAddress)) {
					const current = tokenMap.get(tokenAddress)!;
					current.totalBalance += BigInt(vault.balance);
					current.vaultCount += 1;
				}
			});

			// Calculate USD values and format data for this network
			const networkTlv = Array.from(tokenMap.values())
				.map((item) => {
					// Find the quote for this token - use ALL available quotes, not just current network
					const quote = $tokenGlobalQuote.find((q: ApiStockQuote) => {
						const symbol = q['Global Quote']['01. symbol'];
						// Match token symbol with quote symbol (remove 's1' suffix if present)
						return symbol === item.sft.symbol || symbol === item.sft.symbol.replace('s1', '');
					});

					let usdValue = 0;
					if (quote) {
						const price = parseFloat(quote['Global Quote']['05. price']);
						const totalBalanceInUnits = parseFloat(formatUnits(item.totalBalance, 18)); // Assuming 18 decimals for SFTS
						usdValue = price * totalBalanceInUnits;
					}

					return {
						...item,
						usdValue,
						formattedBalance: formatUnits(item.totalBalance, 18),
						formattedUsdValue:
							usdValue > 0
								? `$${usdValue.toLocaleString(undefined, {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2
									})}`
								: 'N/A'
					};
				})
				.sort((a, b) => b.usdValue - a.usdValue); // Sort by USD value descending

			// Calculate total network TLV
			const totalNetworkTlv = networkTlv.reduce((sum, item) => sum + item.usdValue, 0);

			return {
				network: networkData.network,
				tlv: totalNetworkTlv,
				formattedTlv: `$${totalNetworkTlv.toLocaleString(undefined, {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2
				})}`,
				tokenData: networkTlv,
				vaultCount: networkData.vaults.length
			};
		});
	})();

	// Calculate total platform TLV across all networks - COMPLETELY network-agnostic
	$: totalPlatformTlv = allNetworksTlv.reduce((sum, network) => sum + network.tlv, 0);
	$: formattedTotalTlv = `$${totalPlatformTlv.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;

	// Calculate token-level volumes across all networks (combining all vaults for the same token) - COMPLETELY network-agnostic
	$: allNetworksTokenVolumes = (() => {
		if (
			!$allNetworksTradesMonthQuery.data ||
			!$allNetworksSftsQuery.data ||
			$allNetworksSftsQuery.data.length === 0
		) {
			return [];
		}

		// Group trades by token across all networks to calculate token-level volumes
		const tokenMap = new Map<
			string,
			{
				sft: OffchainAssetReceiptVault;
				inVolume: bigint;
				outVolume: bigint;
				netVolume: bigint;
				totalVolume: bigint;
				tradeCount: number;
				usdVolume: number;
				networks: string[];
			}
		>();

		// Initialize all SFTS with zero volume
		$allNetworksSftsQuery.data.forEach((sft) => {
			tokenMap.set(sft.address.toLowerCase(), {
				sft,
				inVolume: 0n,
				outVolume: 0n,
				netVolume: 0n,
				totalVolume: 0n,
				tradeCount: 0,
				usdVolume: 0,
				networks: []
			});
		});

		// Process each trade from all networks to build token-level volumes
		$allNetworksTradesMonthQuery.data.forEach((networkTrades) => {
			networkTrades.trades.forEach((trade: SgTrade) => {
				// Handle input vault
				const inputToken = trade.inputVaultBalanceChange.vault.token;
				const inputAmount = BigInt(trade.inputVaultBalanceChange.amount);
				const inputTokenAddress = inputToken.address.toLowerCase();

				if (tokenMap.has(inputTokenAddress)) {
					const current = tokenMap.get(inputTokenAddress)!;
					// Only count positive amounts as IN volume
					if (inputAmount > 0n) {
						current.inVolume += inputAmount;
					}
					current.tradeCount += 1;
					// Add network to the list if not already present
					if (!current.networks.includes(networkTrades.network.displayName)) {
						current.networks.push(networkTrades.network.displayName);
					}
				}

				// Handle output vault
				const outputToken = trade.outputVaultBalanceChange.vault.token;
				const outputAmount = BigInt(trade.outputVaultBalanceChange.amount);
				const outputTokenAddress = outputToken.address.toLowerCase();

				if (tokenMap.has(outputTokenAddress)) {
					const current = tokenMap.get(outputTokenAddress)!;
					// Only count negative amounts as OUT volume
					if (outputAmount < 0n) {
						current.outVolume += -outputAmount;
					}
					// Only increment trade count if this is a different token
					if (outputTokenAddress !== inputTokenAddress) {
						current.tradeCount += 1;
					}
					// Add network to the list if not already present
					if (!current.networks.includes(networkTrades.network.displayName)) {
						current.networks.push(networkTrades.network.displayName);
					}
				}
			});
		});

		// Calculate net volumes, total volumes, and USD volumes
		tokenMap.forEach((tokenData) => {
			// Calculate net volume (in - out)
			tokenData.netVolume = tokenData.inVolume - tokenData.outVolume;

			// Calculate total volume (max of in or out, not sum)
			tokenData.totalVolume =
				tokenData.inVolume > tokenData.outVolume ? tokenData.inVolume : tokenData.outVolume;

			// Find the quote for this token - use ALL available quotes, not just current network
			const quote = $tokenGlobalQuote.find((q: ApiStockQuote) => {
				const symbol = q['Global Quote']['01. symbol'];
				// Match token symbol with quote symbol (remove 's1' suffix if present)
				return symbol === tokenData.sft.symbol || symbol === tokenData.sft.symbol.replace('s1', '');
			});

			if (quote) {
				const price = parseFloat(quote['Global Quote']['05. price']);
				const totalVolumeInUnits = parseFloat(formatUnits(tokenData.totalVolume, 18)); // Assuming 18 decimals for SFTS
				tokenData.usdVolume = price * totalVolumeInUnits;
			} else {
				tokenData.usdVolume = 0;
			}
		});

		// Convert to array and sort by total volume (descending)
		const result = Array.from(tokenMap.values())
			.sort((a, b) => Number(b.totalVolume - a.totalVolume))
			.map((item) => ({
				...item,
				formattedInVolume: formatUnits(item.inVolume, 18),
				formattedOutVolume: formatUnits(item.outVolume, 18),
				formattedNetVolume: formatUnits(item.netVolume, 18),
				formattedTotalVolume: formatUnits(item.totalVolume, 18),
				formattedUsdVolume:
					item.usdVolume > 0
						? `$${item.usdVolume.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2
							})}`
						: 'N/A'
			}));
		return result;
	})();

	// Calculate token-level volumes for last week across all networks - COMPLETELY network-agnostic
	$: allNetworksTokenVolumesWeek = (() => {
		if (
			!$allNetworksTradesWeekQuery.data ||
			!$allNetworksSftsQuery.data ||
			$allNetworksSftsQuery.data.length === 0
		) {
			return [];
		}

		// Group trades by token across all networks to calculate token-level volumes
		const tokenMap = new Map<
			string,
			{
				sft: OffchainAssetReceiptVault;
				inVolume: bigint;
				outVolume: bigint;
				netVolume: bigint;
				totalVolume: bigint;
				tradeCount: number;
				usdVolume: number;
				networks: string[];
			}
		>();

		// Initialize all SFTS with zero volume
		$allNetworksSftsQuery.data.forEach((sft) => {
			tokenMap.set(sft.address.toLowerCase(), {
				sft,
				inVolume: 0n,
				outVolume: 0n,
				netVolume: 0n,
				totalVolume: 0n,
				tradeCount: 0,
				usdVolume: 0,
				networks: []
			});
		});

		// Process each trade from all networks to build token-level volumes
		$allNetworksTradesWeekQuery.data.forEach((networkTrades) => {
			networkTrades.trades.forEach((trade: SgTrade) => {
				// Handle input vault
				const inputToken = trade.inputVaultBalanceChange.vault.token;
				const inputAmount = BigInt(trade.inputVaultBalanceChange.amount);
				const inputTokenAddress = inputToken.address.toLowerCase();

				if (tokenMap.has(inputTokenAddress)) {
					const current = tokenMap.get(inputTokenAddress)!;
					// Only count positive amounts as IN volume
					if (inputAmount > 0n) {
						current.inVolume += inputAmount;
					}
					current.tradeCount += 1;
					// Add network to the list if not already present
					if (!current.networks.includes(networkTrades.network.displayName)) {
						current.networks.push(networkTrades.network.displayName);
					}
				}

				// Handle output vault
				const outputToken = trade.outputVaultBalanceChange.vault.token;
				const outputAmount = BigInt(trade.outputVaultBalanceChange.amount);
				const outputTokenAddress = outputToken.address.toLowerCase();

				if (tokenMap.has(outputTokenAddress)) {
					const current = tokenMap.get(outputTokenAddress)!;
					// Only count negative amounts as OUT volume
					if (outputAmount < 0n) {
						current.outVolume += -outputAmount;
					}
					// Only increment trade count if this is a different token
					if (outputTokenAddress !== inputTokenAddress) {
						current.tradeCount += 1;
					}
					// Add network to the list if not already present
					if (!current.networks.includes(networkTrades.network.displayName)) {
						current.networks.push(networkTrades.network.displayName);
					}
				}
			});
		});

		// Calculate net volumes, total volumes, and USD volumes
		tokenMap.forEach((tokenData) => {
			// Calculate net volume (in - out)
			tokenData.netVolume = tokenData.inVolume - tokenData.outVolume;

			// Calculate total volume (max of in or out, not sum)
			tokenData.totalVolume =
				tokenData.inVolume > tokenData.outVolume ? tokenData.inVolume : tokenData.outVolume;

			// Find the quote for this token - use ALL available quotes, not just current network
			const quote = $tokenGlobalQuote.find((q: ApiStockQuote) => {
				const symbol = q['Global Quote']['01. symbol'];
				// Match token symbol with quote symbol (remove 's1' suffix if present)
				return symbol === tokenData.sft.symbol || symbol === tokenData.sft.symbol.replace('s1', '');
			});

			if (quote) {
				const price = parseFloat(quote['Global Quote']['05. price']);
				const totalVolumeInUnits = parseFloat(formatUnits(tokenData.totalVolume, 18)); // Assuming 18 decimals for SFTS
				tokenData.usdVolume = price * totalVolumeInUnits;
			} else {
				tokenData.usdVolume = 0;
			}
		});

		// Convert to array and sort by total volume (descending)
		const result = Array.from(tokenMap.values())
			.sort((a, b) => Number(b.totalVolume - a.totalVolume))
			.map((item) => ({
				...item,
				formattedInVolume: formatUnits(item.inVolume, 18),
				formattedOutVolume: formatUnits(item.outVolume, 18),
				formattedNetVolume: formatUnits(item.netVolume, 18),
				formattedTotalVolume: formatUnits(item.totalVolume, 18),
				formattedUsdVolume:
					item.usdVolume > 0
						? `$${item.usdVolume.toLocaleString(undefined, {
								minimumFractionDigits: 2,
								maximumFractionDigits: 2
							})}`
						: 'N/A'
			}));
		return result;
	})();

	// Calculate total platform volume in USD for both time periods across all networks - COMPLETELY network-agnostic
	$: totalPlatformVolumeUsdMonth = allNetworksTokenVolumes.reduce(
		(sum, item) => sum + item.usdVolume,
		0
	);
	$: formattedTotalVolumeUsdMonth = `$${totalPlatformVolumeUsdMonth.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;

	$: totalPlatformVolumeUsdWeek = allNetworksTokenVolumesWeek.reduce(
		(sum, item) => sum + item.usdVolume,
		0
	);
	$: formattedTotalVolumeUsdWeek = `$${totalPlatformVolumeUsdWeek.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	})}`;

	// Tab state
	let activeTab = 'month';
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<div class="max-w-8xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-12">
			<div class="mb-6">
				<h1 class="text-4xl font-bold text-white">Cross-Network Metrics</h1>
				<p class="mt-2 text-lg text-gray-400">
					Total Value Locked (TVL) and Trading Volume across all supported networks
				</p>
			</div>

			{#if networks.length > 1}
				<div class="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
					<div class="flex items-start space-x-3">
						<div class="flex-shrink-0">
							<svg class="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
								<path
									fill-rule="evenodd"
									d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
									clip-rule="evenodd"
								/>
							</svg>
						</div>
						<div class="text-sm text-blue-300">
							<strong>Multi-Network Data:</strong> This page now aggregates data from {networks.length}
							networks: {networks.map((n) => n.displayName).join(', ')}. All metrics shown are
							cross-network totals.
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Key Metrics Grid -->
		<div class="mb-12 grid grid-cols-1 gap-6 md:grid-cols-4">
			<!-- Total Locked Value Card -->
			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-green-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-green-700 via-blue-600 to-purple-500 opacity-0 transition-opacity group-hover:opacity-100"
				></div>
				<div class="relative z-10">
					<div class="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
						Total Locked Value
					</div>
					<div class="text-3xl font-bold text-white">
						{formattedTotalTlv}
					</div>
					<div class="mt-1 text-xs font-medium text-green-500">All Networks • Live</div>
				</div>
			</div>

			<!-- Total Volume Card -->
			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
				></div>
				<div class="relative z-10">
					<div class="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
						Trading Volume
					</div>
					<div class="text-3xl font-bold text-white">
						{activeTab === 'month' ? formattedTotalVolumeUsdMonth : formattedTotalVolumeUsdWeek}
					</div>
					<div class="mt-1 text-xs font-medium text-yellow-500">
						{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'}
					</div>
				</div>
			</div>

			<!-- Total Trades Card -->
			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
				></div>
				<div class="relative z-10">
					<div class="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
						Total Trades
					</div>
					<div class="text-3xl font-bold text-white">
						{activeTab === 'month'
							? $allNetworksTradesMonthQuery.data
								? $allNetworksTradesMonthQuery.data.reduce(
										(sum, network) => sum + network.trades.length,
										0
									)
								: 0
							: $allNetworksTradesWeekQuery.data
								? $allNetworksTradesWeekQuery.data.reduce(
										(sum, network) => sum + network.trades.length,
										0
									)
								: 0}
					</div>
					<div class="mt-1 text-xs font-medium text-yellow-500">
						{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'}
					</div>
				</div>
			</div>

			<!-- Active Tokens Card -->
			<div
				class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-yellow-500/30"
			>
				<div
					class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
				></div>
				<div class="relative z-10">
					<div class="mb-2 text-sm font-medium uppercase tracking-wide text-gray-400">
						Active Tokens
					</div>
					<div class="text-3xl font-bold text-white">
						{activeTab === 'month'
							? allNetworksTokenVolumes.length
							: allNetworksTokenVolumesWeek.length}
					</div>
					<div class="mt-1 text-xs font-medium text-yellow-500">
						{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'}
					</div>
				</div>
			</div>
		</div>

		<!-- Network Breakdown Table -->
		<div
			class="mb-12 overflow-hidden rounded-2xl border border-white/10 bg-gray-800/50 backdrop-blur-sm"
		>
			<div class="border-b border-white/10 px-8 py-6">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold text-white">TVL by Network</h2>
						<p class="mt-1 text-sm text-gray-400">
							Total value locked across each supported network • Live data
						</p>
					</div>
					<div class="flex items-center space-x-2">
						<div class="h-3 w-3 rounded-full bg-green-500"></div>
						<span class="text-xs text-gray-400">Live Data</span>
					</div>
				</div>
			</div>

			{#if allNetworksTlv.length > 0}
				<div class="overflow-x-auto">
					<table class="min-w-full">
						<thead>
							<tr class="border-b border-white/10">
								<th
									class="px-8 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									Network
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									TVL
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									Vaults
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									Status
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-white/10">
							{#each allNetworksTlv as networkData}
								<tr class="transition-colors duration-150 hover:bg-gray-700/20">
									<td class="px-8 py-5">
										<div class="flex items-center space-x-4">
											<div class="flex-shrink-0">
												<div
													class="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-gray-700"
												>
													<span class="text-lg font-bold text-white"
														>{networkData.network.displayName.charAt(0)}</span
													>
												</div>
											</div>
											<div>
												<div class="font-medium text-white">{networkData.network.displayName}</div>
												<div class="text-sm text-gray-400">
													{networkData.network.currencySymbol}
												</div>
												<div class="font-mono text-xs text-gray-500">
													{networkData.network.name}
												</div>
											</div>
										</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-lg font-medium text-green-400">{networkData.formattedTlv}</div>
									</td>
									<td class="px-8 py-4 text-right">
										<div
											class="inline-flex items-center rounded-full bg-gray-700/50 px-3 py-1 text-xs font-medium text-gray-300"
										>
											{networkData.vaultCount}
										</div>
									</td>
									<td class="px-8 py-4 text-right">
										<div class="flex items-center justify-end space-x-2">
											<div class="h-3 w-3 rounded-full bg-green-500"></div>
											<span class="text-xs text-gray-400">Active</span>
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if $allNetworksVaultsQuery.isLoading}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading cross-network vault data..." />
				</div>
			{:else if !$allNetworksSftsQuery.data || $allNetworksSftsQuery.data.length === 0}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading cross-network SFT data..." />
				</div>
			{:else if !$tokenGlobalQuote.length}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading price data..." />
				</div>
			{:else}
				<div class="p-12 text-center">
					<div class="text-lg text-gray-400">No cross-network data available</div>
					<div class="mt-1 text-sm text-gray-500">
						Try refreshing the page or check your network connection
					</div>
				</div>
			{/if}
		</div>

		<!-- Time Period Selector for Trading Volumes -->
		<div class="justify-left mb-8 flex">
			<div class="inline-flex rounded-xl border border-white/10 bg-gray-800/50 p-1">
				<button
					class="rounded-lg px-6 py-3 text-sm font-medium transition-all duration-200 {activeTab ===
					'month'
						? 'bg-gray-700 text-white'
						: 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}"
					on:click={() => (activeTab = 'month')}
				>
					Last 30 Days
				</button>
				<button
					class="rounded-lg px-6 py-3 text-sm font-medium transition-all duration-200 {activeTab ===
					'week'
						? 'bg-gray-700 text-white'
						: 'text-gray-400 hover:bg-gray-700/50 hover:text-white'}"
					on:click={() => (activeTab = 'week')}
				>
					Last 7 Days
				</button>
			</div>
		</div>

		<!-- Trading Volumes Table -->
		<div class="overflow-hidden rounded-2xl border border-white/10 bg-gray-800/50 backdrop-blur-sm">
			<div class="border-b border-white/10 px-8 py-6">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold text-white">Cross-Network Token Trading Volumes</h2>
						<p class="mt-1 text-sm text-gray-400">
							{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'} • Combined volumes across all
							networks
						</p>
					</div>
					<div class="flex items-center space-x-2">
						<div class="h-3 w-3 rounded-full bg-yellow-500"></div>
						<span class="text-xs text-gray-400">Live Data</span>
					</div>
				</div>
			</div>

			{#if (activeTab === 'month' && $allNetworksTradesMonthQuery.isLoading) || (activeTab === 'week' && $allNetworksTradesWeekQuery.isLoading)}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading cross-network trading data..." />
				</div>
			{:else if (activeTab === 'month' && $allNetworksTradesMonthQuery.isError) || (activeTab === 'week' && $allNetworksTradesWeekQuery.isError)}
				<div class="p-12 text-center">
					<div class="mb-2 text-lg font-medium text-red-400">Error loading data</div>
					<div class="text-sm text-gray-400">
						{activeTab === 'month'
							? $allNetworksTradesMonthQuery.error?.message
							: $allNetworksTradesWeekQuery.error?.message || 'Unknown error occurred'}
					</div>
				</div>
			{:else if activeTab === 'month' ? allNetworksTokenVolumes.length > 0 : allNetworksTokenVolumesWeek.length > 0}
				<div class="overflow-x-auto">
					<table class="min-w-full">
						<thead>
							<tr class="border-b border-white/10">
								<th
									class="px-8 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									Token
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									IN Volume
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									OUT Volume
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									NET Volume
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									Total Volume
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									USD Value
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									Trades
								</th>
								<th
									class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300"
								>
									Networks
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-white/10">
							{#each activeTab === 'month' ? allNetworksTokenVolumes : allNetworksTokenVolumesWeek as item}
								<tr class="transition-colors duration-150 hover:bg-gray-700/20">
									<td class="px-8 py-5">
										<div class="flex items-center space-x-4">
											<div class="flex-shrink-0">
												<img
													src={ALL_TOKENS.find(
														(s) => s.address.toLowerCase() === item.sft.address.toLowerCase()
													)?.logoUrl}
													alt={item.sft.symbol}
													class="h-10 w-10 rounded-xl border border-white/10 bg-gray-700"
												/>
											</div>
											<div>
												<div class="font-medium text-white">{item.sft.symbol}</div>
												<div class="text-sm text-gray-400">{item.sft.name}</div>
												<div class="font-mono text-xs text-gray-500">
													{item.sft.address.slice(0, 6)}...{item.sft.address.slice(-4)}
												</div>
											</div>
										</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm text-gray-300">{item.formattedInVolume}</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm text-gray-300">{item.formattedOutVolume}</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm {item.netVolume >= 0n ? 'text-green-400' : 'text-red-400'}">
											{item.formattedNetVolume}
										</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm font-medium text-yellow-500">
											{item.formattedTotalVolume}
										</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm font-medium text-white">{item.formattedUsdVolume}</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div
											class="inline-flex items-center rounded-full bg-gray-700/50 px-3 py-1 text-xs font-medium text-gray-300"
										>
											{item.tradeCount}
										</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-xs text-gray-400">
											{item.networks.join(', ')}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="p-12 text-center">
					<div class="text-lg text-gray-400">No cross-network trading data available</div>
					<div class="mt-1 text-sm text-gray-500">Try selecting a different time period</div>
				</div>
			{/if}
		</div>
	</div>
</div>
