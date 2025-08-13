<script lang="ts">
	import { currentNetwork, tokenGlobalQuote, sfts } from '$lib/stores';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import { getTrades } from '$lib/query';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { getAllTokensByNetwork } from '$lib/network';
	import type { SgTrade } from '@rainlanguage/orderbook';
	import type { ApiStockQuote } from '$lib/types';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { getVaults } from '@rainlanguage/orderbook';
	import type { SgVaultWithSubgraphName } from '@rainlanguage/orderbook';

	// Get all SFTS for the current network
	$: allSfts = $sfts || [];
	
	// Get all tokens for logo URLs (like the tokens page does)
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Query for vault balances (like vaultlist page) - fetch ALL vaults
	$: vaultsQuery = createQuery({
		queryKey: ['metrics-vaults', $currentNetwork?.id],
		queryFn: async () => {
			if (!$currentNetwork?.orderbook_subgraph_url) return [];
			
			let allVaults: SgVaultWithSubgraphName[] = [];
			let page = 1;
			const pageSize = 1000;
			let hasMore = true;
			
			// Fetch all vaults by paginating through all pages
			while (hasMore) {
				const vaultsResult = await getVaults(
					[
						{
							url: $currentNetwork.orderbook_subgraph_url,
							name: $currentNetwork.raindexNetworkSlug
						}
					],
					{
						owners: [],
						hideZeroBalance: false
					},
					{ page, pageSize }
				);
				
				if (vaultsResult.error) throw new Error(vaultsResult.error.readableMsg);
				
				const vaults = vaultsResult.value;
				allVaults.push(...vaults);
				
				// Check if there are more pages
				hasMore = vaults.length === pageSize;
				page++;
			}
			
			return allVaults;
		},
		enabled: !!$currentNetwork?.orderbook_subgraph_url,
		retry: 3,
		retryDelay: 1000
	});

	// Query for trades data - last month (30 days)
	$: tradesQueryMonth = createQuery({
		queryKey: ['metrics-trades-month', $currentNetwork?.id],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const monthAgo = now - 30 * 86400; // Last 30 days
			const trades = await getTrades(monthAgo, now, $currentNetwork);
			return trades;
		},
		enabled: !!$currentNetwork?.orderbook_subgraph_url,
		retry: 3,
		retryDelay: 1000
	});

	// Query for trades data - last week (7 days)
	$: tradesQueryWeek = createQuery({
		queryKey: ['metrics-trades-week', $currentNetwork?.id],
		queryFn: async () => {
			const now = Math.floor(Date.now() / 1000);
			const weekAgo = now - 7 * 86400; // Last 7 days
			const trades = await getTrades(weekAgo, now, $currentNetwork);
			return trades;
		},
		enabled: !!$currentNetwork?.orderbook_subgraph_url,
		retry: 3,
		retryDelay: 1000
	});

	// Calculate Total Locked Value (TLV) and individual SFT values using vault balances
	$: sftTotalValues = (() => {
		if (!$vaultsQuery.data || !$tokenGlobalQuote.length) return [];

		// Group vaults by token to calculate total balances
		const tokenMap = new Map<string, {
			sft: OffchainAssetReceiptVault;
			totalBalance: bigint;
			vaultCount: number;
		}>();

		// Initialize all SFTS with zero balance
		allSfts.forEach(sft => {
			tokenMap.set(sft.address.toLowerCase(), {
				sft,
				totalBalance: 0n,
				vaultCount: 0
			});
		});

		// Sum up balances from all vaults
		$vaultsQuery.data?.forEach((vaultData: SgVaultWithSubgraphName) => {
			const vault = vaultData.vault;
			const tokenAddress = vault.token.id.toLowerCase();
			
			if (tokenMap.has(tokenAddress)) {
				const current = tokenMap.get(tokenAddress)!;
				current.totalBalance += BigInt(vault.balance);
				current.vaultCount += 1;
			}
		});

		// Calculate USD values and format data
		return Array.from(tokenMap.values())
			.map(item => {
				// Find the quote for this token
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
					formattedUsdValue: usdValue > 0 ? `$${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'
				};
			})
			.sort((a, b) => b.usdValue - a.usdValue); // Sort by USD value descending
	})();

	// Calculate total platform TLV
	$: totalPlatformTlv = sftTotalValues.reduce((sum, item) => sum + item.usdValue, 0);
	$: formattedTotalTlv = `$${totalPlatformTlv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	// Calculate token-level volumes (combining all vaults for the same token)
	$: tokenVolumes = (() => {
		if (!$tradesQueryMonth.data || !allSfts.length) return [];

		// Group trades by token to calculate token-level volumes (combining all vaults)
		const tokenMap = new Map<string, {
			sft: OffchainAssetReceiptVault;
			inVolume: bigint;
			outVolume: bigint;
			netVolume: bigint;
			totalVolume: bigint;
			tradeCount: number;
			usdVolume: number;
		}>();

		// Initialize all SFTS with zero volume
		allSfts.forEach(sft => {
			tokenMap.set(sft.address.toLowerCase(), {
				sft,
				inVolume: 0n,
				outVolume: 0n,
				netVolume: 0n,
				totalVolume: 0n,
				tradeCount: 0,
				usdVolume: 0
			});
		});

		// Process each trade to build token-level volumes
		$tradesQueryMonth.data.forEach((trade: SgTrade) => {
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
			}

			// Handle output vault
			const outputToken = trade.outputVaultBalanceChange.vault.token;
			const outputAmount = BigInt(trade.outputVaultBalanceChange.amount);
			const outputTokenAddress = outputToken.address.toLowerCase();
			
			if (tokenMap.has(outputTokenAddress)) {
				const current = tokenMap.get(outputTokenAddress)!;
				// Only count negative amounts as OUT volume
				if (outputAmount < 0n) {
					current.outVolume += (-outputAmount);
				}
				// Only increment trade count if this is a different token
				if (outputTokenAddress !== inputTokenAddress) {
					current.tradeCount += 1;
				}
			}
		});

		// Calculate net volumes, total volumes, and USD volumes
		tokenMap.forEach((tokenData) => {
			// Calculate net volume (in - out)
			tokenData.netVolume = tokenData.inVolume - tokenData.outVolume;
			
			// Calculate total volume (max of in or out, not sum)
			tokenData.totalVolume = tokenData.inVolume > tokenData.outVolume ? tokenData.inVolume : tokenData.outVolume;
			
			// Find the quote for this token
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
		return Array.from(tokenMap.values())
			.sort((a, b) => Number(b.totalVolume - a.totalVolume))
			.map(item => ({
				...item,
				formattedInVolume: formatUnits(item.inVolume, 18),
				formattedOutVolume: formatUnits(item.outVolume, 18),
				formattedNetVolume: formatUnits(item.netVolume, 18),
				formattedTotalVolume: formatUnits(item.totalVolume, 18),
				formattedUsdVolume: item.usdVolume > 0 ? `$${item.usdVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'
			}));
	})();

	// Calculate token-level volumes for last week
	$: tokenVolumesWeek = (() => {
		if (!$tradesQueryWeek.data || !allSfts.length) return [];

		// Group trades by token to calculate token-level volumes (combining all vaults)
		const tokenMap = new Map<string, {
			sft: OffchainAssetReceiptVault;
			inVolume: bigint;
			outVolume: bigint;
			netVolume: bigint;
			totalVolume: bigint;
			tradeCount: number;
			usdVolume: number;
		}>();

		// Initialize all SFTS with zero volume
		allSfts.forEach(sft => {
			tokenMap.set(sft.address.toLowerCase(), {
				sft,
				inVolume: 0n,
				outVolume: 0n,
				netVolume: 0n,
				totalVolume: 0n,
				tradeCount: 0,
				usdVolume: 0
			});
		});

		// Process each trade to build token-level volumes
		$tradesQueryWeek.data.forEach((trade: SgTrade) => {
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
			}

			// Handle output vault
			const outputToken = trade.outputVaultBalanceChange.vault.token;
			const outputAmount = BigInt(trade.outputVaultBalanceChange.amount);
			const outputTokenAddress = outputToken.address.toLowerCase();
			
			if (tokenMap.has(outputTokenAddress)) {
				const current = tokenMap.get(outputTokenAddress)!;
				// Only count negative amounts as OUT volume
				if (outputAmount < 0n) {
					current.outVolume += (-outputAmount);
				}
				// Only increment trade count if this is a different token
				if (outputTokenAddress !== inputTokenAddress) {
					current.tradeCount += 1;
				}
			}
		});

		// Calculate net volumes, total volumes, and USD volumes
		tokenMap.forEach((tokenData) => {
			// Calculate net volume (in - out)
			tokenData.netVolume = tokenData.inVolume - tokenData.outVolume;
			
			// Calculate total volume (max of in or out, not sum)
			tokenData.totalVolume = tokenData.inVolume > tokenData.outVolume ? tokenData.inVolume : tokenData.outVolume;
			
			// Find the quote for this token
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
		return Array.from(tokenMap.values())
			.sort((a, b) => Number(b.totalVolume - a.totalVolume))
			.map(item => ({
				...item,
				formattedInVolume: formatUnits(item.inVolume, 18),
				formattedOutVolume: formatUnits(item.outVolume, 18),
				formattedNetVolume: formatUnits(item.netVolume, 18),
				formattedTotalVolume: formatUnits(item.totalVolume, 18),
				formattedUsdVolume: item.usdVolume > 0 ? `$${item.usdVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'N/A'
			}));
	})();

	// Calculate total platform volume in USD for both time periods
	$: totalPlatformVolumeUsdMonth = tokenVolumes.reduce((sum, item) => sum + item.usdVolume, 0);
	$: formattedTotalVolumeUsdMonth = `$${totalPlatformVolumeUsdMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
	
	$: totalPlatformVolumeUsdWeek = tokenVolumesWeek.reduce((sum, item) => sum + item.usdVolume, 0);
	$: formattedTotalVolumeUsdWeek = `$${totalPlatformVolumeUsdWeek.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

	// Tab state
	let activeTab = 'month';
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<div class="mx-auto max-w-8xl px-4 py-8 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-12">
			<h1 class="text-2xl font-bold text-white sm:text-3xl">
				Platform Metrics
			</h1>
		</div>

		<!-- Key Metrics Grid -->
		<div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
			<!-- Total Locked Value Card -->
			<div class="bg-gray-700/30 rounded-xl border border-white/5 p-6 relative overflow-hidden group hover:border-green-500/30 transition-all">
				<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-green-700 via-blue-600 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
				<div class="relative z-10">
					<div class="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Total Locked Value</div>
					<div class="text-3xl font-bold text-white">
						{formattedTotalTlv}
					</div>
					<div class="text-xs text-green-500 mt-1 font-medium">
						All SFTs • Live
					</div>
				</div>
			</div>

			<!-- Total Volume Card -->
			<div class="bg-gray-700/30 rounded-xl border border-white/5 p-6 relative overflow-hidden group hover:border-yellow-500/30 transition-all">
				<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
				<div class="relative z-10">
					<div class="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Trading Volume</div>
					<div class="text-3xl font-bold text-white">
						{activeTab === 'month' ? formattedTotalVolumeUsdMonth : formattedTotalVolumeUsdWeek}
					</div>
					<div class="text-xs text-yellow-500 mt-1 font-medium">
						{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'}
					</div>
				</div>
			</div>

			<!-- Total Trades Card -->
			<div class="bg-gray-700/30 rounded-xl border border-white/5 p-6 relative overflow-hidden group hover:border-yellow-500/30 transition-all">
				<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
				<div class="relative z-10">
					<div class="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Total Trades</div>
					<div class="text-3xl font-bold text-white">
						{activeTab === 'month' 
							? ($tradesQueryMonth.data ? $tradesQueryMonth.data.length : 0)
							: ($tradesQueryWeek.data ? $tradesQueryWeek.data.length : 0)
						}
					</div>
					<div class="text-xs text-yellow-500 mt-1 font-medium">
						{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'}
					</div>
				</div>
			</div>

			<!-- Active Tokens Card -->
			<div class="bg-gray-700/30 rounded-xl border border-white/5 p-6 relative overflow-hidden group hover:border-yellow-500/30 transition-all">
				<div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity"></div>
				<div class="relative z-10">
					<div class="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide">Active Tokens</div>
					<div class="text-3xl font-bold text-white">
						{activeTab === 'month' ? tokenVolumes.length : tokenVolumesWeek.length}
					</div>
					<div class="text-xs text-yellow-500 mt-1 font-medium">
						{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'}
					</div>
				</div>
			</div>
		</div>

		<!-- Total Locked Value Table -->
		<div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden mb-12">
			<div class="px-8 py-6 border-b border-white/10">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold text-white">Total Locked Value by SFT</h2>
						<p class="text-sm text-gray-400 mt-1">
							Total value of all SFTs across all vaults • Live data
						</p>
					</div>
					<div class="flex items-center space-x-2">
						<div class="w-3 h-3 bg-green-500 rounded-full"></div>
						<span class="text-xs text-gray-400">Live Data</span>
					</div>
				</div>
			</div>

			{#if sftTotalValues.length > 0}
				<div class="overflow-x-auto">
					<table class="min-w-full">
						<thead>
							<tr class="border-b border-white/10">
								<th class="px-8 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">
									Token
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									Total Balance
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									USD Value
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									Vaults
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-white/10">
							{#each sftTotalValues as item}
								<tr class="hover:bg-gray-700/20 transition-colors duration-150">
									<td class="px-8 py-5">
										<div class="flex items-center space-x-4">
											<div class="flex-shrink-0">
												<img
													src={ALL_TOKENS.find(
														(s) => s.address.toLowerCase() === item.sft.address.toLowerCase()
													)?.logoUrl}
													alt={item.sft.symbol}
													class="w-10 h-10 rounded-xl bg-gray-700 border border-white/10"
												/>
											</div>
											<div>
												<div class="font-medium text-white">{item.sft.symbol}</div>
												<div class="text-sm text-gray-400">{item.sft.name}</div>
												<div class="text-xs text-gray-500 font-mono">
													{item.sft.address.slice(0, 6)}...{item.sft.address.slice(-4)}
												</div>
											</div>
										</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm text-gray-300">{item.formattedBalance}</div>
									</td>
									<td class="px-8 py-4 text-right">
										<div class="text-sm font-medium text-green-400">{item.formattedUsdValue}</div>
									</td>
									<td class="px-8 py-4 text-right">
										<div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-300">
											{item.vaultCount}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else if $vaultsQuery.isLoading}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading vault data..." />
				</div>
			{:else if !allSfts.length}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading SFT data..." />
				</div>
			{:else if !$tokenGlobalQuote.length}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading price data..." />
				</div>
			{:else}
				<div class="p-12 text-center">
					<div class="text-gray-400 text-lg">No SFT data available</div>
					<div class="text-sm text-gray-500 mt-1">Try refreshing the page or check your network connection</div>
				</div>
			{/if}
		</div>

		<!-- Time Period Selector for Trading Volumes -->
		<div class="mb-8 flex justify-left">
			<div class="inline-flex rounded-xl bg-gray-800/50 p-1 border border-white/10">
				<button
					class="px-6 py-3 rounded-lg font-medium text-sm transition-all duration-200 {activeTab === 'month' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}"
					on:click={() => activeTab = 'month'}
				>
					Last 30 Days
				</button>
				<button
					class="px-6 py-3 rounded-lg font-medium text-sm transition-all duration-200 {activeTab === 'week' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}"
					on:click={() => activeTab = 'week'}
				>
					Last 7 Days
				</button>
			</div>
		</div>

		<!-- Trading Volumes Table -->
		<div class="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
			<div class="px-8 py-6 border-b border-white/10">
				<div class="flex items-center justify-between">
					<div>
						<h2 class="text-xl font-semibold text-white">Token Trading Volumes</h2>
						<p class="text-sm text-gray-400 mt-1">
							{activeTab === 'month' ? 'Last 30 days' : 'Last 7 days'} • Combined vault volumes
						</p>
					</div>
					<div class="flex items-center space-x-2">
						<div class="w-3 h-3 bg-yellow-500 rounded-full"></div>
						<span class="text-xs text-gray-400">Live Data</span>
					</div>
				</div>
			</div>

			{#if (activeTab === 'month' && $tradesQueryMonth.isLoading) || (activeTab === 'week' && $tradesQueryWeek.isLoading)}
				<div class="p-12 text-center">
					<LoadingSpinner variant="inline" size="lg" text="Loading trading data..." />
				</div>
			{:else if (activeTab === 'month' && $tradesQueryMonth.isError) || (activeTab === 'week' && $tradesQueryWeek.isError)}
				<div class="p-12 text-center">
					<div class="text-red-400 text-lg font-medium mb-2">Error loading data</div>
					<div class="text-sm text-gray-400">
						{activeTab === 'month' ? $tradesQueryMonth.error?.message : $tradesQueryWeek.error?.message || 'Unknown error occurred'}
					</div>
				</div>
			{:else if (activeTab === 'month' ? tokenVolumes.length > 0 : tokenVolumesWeek.length > 0)}
				<div class="overflow-x-auto">
					<table class="min-w-full">
						<thead>
							<tr class="border-b border-white/10">
								<th class="px-8 py-4 text-left text-xs font-semibold uppercase tracking-wider text-gray-300">
									Token
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									IN Volume
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									OUT Volume
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									NET Volume
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									Total Volume
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									USD Value
								</th>
								<th class="px-8 py-4 text-right text-xs font-semibold uppercase tracking-wider text-gray-300">
									Trades
								</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-white/10">
							{#each (activeTab === 'month' ? tokenVolumes : tokenVolumesWeek) as item}
								<tr class="hover:bg-gray-700/20 transition-colors duration-150">
									<td class="px-8 py-5">
										<div class="flex items-center space-x-4">
											<div class="flex-shrink-0">
												<img
													src={ALL_TOKENS.find(
														(s) => s.address.toLowerCase() === item.sft.address.toLowerCase()
													)?.logoUrl}
													alt={item.sft.symbol}
													class="w-10 h-10 rounded-xl bg-gray-700 border border-white/10"
												/>
											</div>
											<div>
												<div class="font-medium text-white">{item.sft.symbol}</div>
												<div class="text-sm text-gray-400">{item.sft.name}</div>
												<div class="text-xs text-gray-500 font-mono">
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
										<div class="text-sm {item.netVolume >= 0n ? 'text-green-400' : 'text-red-400'}">{item.formattedNetVolume}</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm font-medium text-yellow-500">{item.formattedTotalVolume}</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="text-sm font-medium text-white">{item.formattedUsdVolume}</div>
									</td>
									<td class="px-8 py-5 text-right">
										<div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-700/50 text-gray-300">
											{item.tradeCount}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="p-12 text-center">
					<div class="text-gray-400 text-lg">No trading data available</div>
					<div class="text-sm text-gray-500 mt-1">Try selecting a different time period</div>
				</div>
			{/if}
		</div>
	</div>
</div>