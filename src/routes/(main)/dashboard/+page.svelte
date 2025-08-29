<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { connected, signerAddress } from 'svelte-wagmi';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { currentNetwork, sfts, tokenGlobalQuote } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import { getAllTokensByNetwork } from '$lib/network';
	import type { ApiStockQuote } from '$lib/types';
	import { goto } from '$app/navigation';
	import { getOrders, getVaults } from '@rainlanguage/orderbook';
	import type { SgOrderWithSubgraphName, SgErc20, SgVaultWithSubgraphName } from '@rainlanguage/orderbook';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import OrderListTable from '$lib/components/OrderListTable.svelte';
	import VaultListTable from '$lib/components/VaultListTable.svelte';
	import Portfolio from '$lib/components/Portfolio.svelte';
	import { getPrice } from '$lib/getPrice';
	import { Token } from 'sushi/currency';
	import { arbitrum } from '@wagmi/core/chains';

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let isNetworkLoading = false;
	let activeTab: 'portfolio' | 'orders' | 'vaults' = 'portfolio';

	// Order List variables
	let ordersActiveFilter: boolean | undefined = false;
	let orderHashFilter: string | undefined = undefined;
	let showMyOrders = true;
	const ORDER_LIST_PAGE_SIZE = 1000;

	// Vault List variables
	let hideEmptyVaults: boolean | undefined = false;
	let showMyVaults: boolean | undefined = false;
	let isProcessingBalances = false;
	const VAULT_LIST_PAGE_SIZE = 1000;

	let myTokenBalance: {
		token: SgErc20;
		balance: string;
		vaultIds: string[];
		price: string;
		estimatedValue: string;
	}[] = [];

	// Watch for network changes and show loading state
	$: if ($currentNetwork) {
		isNetworkLoading = true;
		// Small delay to show loading state
		setTimeout(() => {
			isNetworkLoading = false;
		}, 300);
	}

	// Query user's token holdings
	$: holdingsQuery = createQuery({
		queryKey: ['userHoldings', $signerAddress, $currentNetwork?.id, $sfts?.length],
		enabled: !!($connected && $signerAddress && $sfts && $currentNetwork),
		queryFn: () => {
			if (!$sfts || !$signerAddress) return [];
			
			const userHoldings = [];
			for (const sft of $sfts) {
				const userHolder = sft.tokenHolders.find(
					holder => holder.address.toLowerCase() === $signerAddress.toLowerCase()
				);
				
				if (userHolder && BigInt(userHolder.balance) > 0n) {
					const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
						(q) => q?.['Global Quote']?.['01. symbol'] === sft.symbol?.split('s1')[0]
					);
					const price = parseFloat(quote?.['Global Quote']?.['05. price'] || '0');
					const priceChange = parseFloat(quote?.['Global Quote']?.['09. change'] || '0');
					const priceChangePercent = parseFloat(quote?.['Global Quote']?.['10. change percent']?.replace('%', '') || '0');
					
					const balance = formatUnits(BigInt(userHolder.balance), 18);
					const value = parseFloat(balance) * price;
					
					userHoldings.push({
						id: sft.id,
						address: sft.address,
						name: sft.name,
						symbol: sft.symbol,
						balance: balance,
						price: price,
						value: value,
						priceChange: priceChange,
						priceChangePercent: priceChangePercent
					});
				}
			}
			
			return userHoldings;
		}
	});


	$: totalValue = ($holdingsQuery?.data || []).reduce((sum, holding) => sum + holding.value, 0);
	$: totalChange24h = ($holdingsQuery?.data || []).reduce((sum, holding) => {
		// Calculate the change in value based on the price change
		return sum + (holding.priceChange * parseFloat(holding.balance));
	}, 0);
	$: activeOrdersCount = $ordersListQuery?.data?.pages?.reduce((sum, page) => sum + page.orders.length, 0) || 0;
	$: activeVaultsCount = myTokenBalance?.filter(v => parseFloat(v.balance) > 0).length || 0;

	// Order List Query
	$: ordersListQuery = createInfiniteQuery({
		queryKey: ['orders', $currentNetwork?.id, ordersActiveFilter, orderHashFilter, showMyOrders],
		queryFn: async ({ pageParam }) => {
			const ordersResult = await getOrders(
				[
					{
						url: $currentNetwork.orderbook_subgraph_url,
						name: $currentNetwork.raindexNetworkSlug
					}
				],
				{
					owners: showMyOrders ? ($signerAddress ? [$signerAddress.toLowerCase()] : []) : [],
					active: ordersActiveFilter ? undefined : true,
					orderHash: orderHashFilter === '' ? undefined : orderHashFilter
				},
				{ page: pageParam + 1, pageSize: ORDER_LIST_PAGE_SIZE }
			);
			if (ordersResult.error) throw new Error(ordersResult.error.readableMsg);
			const allOrders: SgOrderWithSubgraphName[] = ordersResult.value;

			// Filter orders that have any token from forexTokenList in either inputs or outputs
			const filteredOrders = allOrders.filter(({ order }) => {
				const inputAddresses = order.inputs.map((input) => input.token.address.toLowerCase());
				const outputAddresses = order.outputs.map((output) => output.token.address.toLowerCase());
				const filterAddresses = ALL_TOKENS.map((token) => token.address.toLowerCase());
				const hasTokenInInputs = inputAddresses.some((addr) => filterAddresses.includes(addr));
				const hasTokenInOutputs = outputAddresses.some((addr) => filterAddresses.includes(addr));
				return hasTokenInInputs || hasTokenInOutputs;
			});

			return {
				orders: filteredOrders,
				hasMore: allOrders.length === ORDER_LIST_PAGE_SIZE
			};
		},
		initialPageParam: 0,
		getNextPageParam(lastPage, _allPages, lastPageParam) {
			return lastPage.hasMore ? lastPageParam + 1 : undefined;
		},
		enabled: !!$currentNetwork?.orderbook_subgraph_url && activeTab === 'orders'
	});

	// Vault List Query
	$: vaultsListQuery = createInfiniteQuery({
		queryKey: ['vaults', $currentNetwork?.id, hideEmptyVaults, showMyVaults, $signerAddress],
		queryFn: async ({ pageParam }) => {
			const vaultsResult = await getVaults(
				[
					{
						url: $currentNetwork.orderbook_subgraph_url,
						name: $currentNetwork.raindexNetworkSlug
					}
				],
				{
					owners: showMyVaults ? ($signerAddress ? [$signerAddress.toLowerCase()] : []) : [],
					hideZeroBalance: hideEmptyVaults ?? false
				},
				{ page: pageParam + 1, pageSize: VAULT_LIST_PAGE_SIZE }
			);
			if (vaultsResult.error) throw new Error(vaultsResult.error.readableMsg);
			const allVaults: SgVaultWithSubgraphName[] = vaultsResult.value;
			return {
				vaults: allVaults,
				hasMore: allVaults.length === VAULT_LIST_PAGE_SIZE
			};
		},
		initialPageParam: 0,
		getNextPageParam(lastPage, _allPages, lastPageParam) {
			return lastPage.hasMore ? lastPageParam + 1 : undefined;
		},
		enabled: activeTab === 'vaults'
	});

	// Process vault balances
	$: if ($vaultsListQuery.data?.pages[0]?.vaults && activeTab === 'vaults') {
		// Create a map to aggregate balances by token address
		const tokenBalances = new Map<
			string,
			{
				token: SgErc20;
				totalBalance: bigint;
				vaultIds: string[];
			}
		>();

		for (const { vault } of $vaultsListQuery.data.pages[0].vaults) {
			if (
				vault.owner.toLowerCase() === $signerAddress?.toLowerCase() &&
				BigInt(vault.balance) > 0n
			) {
				const tokenAddress = vault.token.id;
				const existing = tokenBalances.get(tokenAddress);

				if (existing) {
					existing.totalBalance += BigInt(vault.balance);
					existing.vaultIds.push(vault.id);
				} else {
					tokenBalances.set(tokenAddress, {
						token: vault.token,
						totalBalance: BigInt(vault.balance),
						vaultIds: [vault.id]
					});
				}
			}
		}

		// Convert map to array and format balances
		const balancePromises = Array.from(tokenBalances.values()).map(
			async ({ token, totalBalance, vaultIds }) => {
				const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
					(q) => q?.['Global Quote']?.['01. symbol'] === token.symbol?.split('s1')[0]
				);

				let price: number;
				if (quote && quote['Global Quote']?.['05. price']) {
					price = parseFloat(quote['Global Quote']['05. price']);
				} else {
					// Fallback to getPrice if not in global quote
					const priceStr = await getPrice(
						new Token({
							chainId: arbitrum.id,
							address: token.id,
							symbol: token.symbol,
							decimals: Number(token.decimals ?? 18),
							name: token.name
						}),
						$currentNetwork.usdcToken
					);
					price = parseFloat(priceStr);
				}

				const balance = parseFloat(formatUnits(totalBalance, Number(token.decimals ?? 18)));
				const estimatedValue = (price * balance).toFixed(6);

				return {
					token,
					balance: balance.toFixed(6),
					vaultIds,
					price: price.toFixed(6),
					estimatedValue
				};
			}
		);

		// Set loading state and process balances
		isProcessingBalances = true;
		Promise.all(balancePromises)
			.then((balances) => {
				myTokenBalance = balances;
				isProcessingBalances = false;
			})
			.catch(() => {
				isProcessingBalances = false;
			});
	}

	function truncateAddress(address: string) {
		if (!address) return '';
		return `${address.slice(0, 6)}...${address.slice(-4)}`;
	}
</script>

<!-- Main Content -->
<div>
	<div class="space-y-6 p-3 sm:space-y-8 sm:p-6">
		{#if isNetworkLoading}
			<div class="flex flex-col items-center justify-center gap-4 py-8">
				<LoadingSpinner
					variant="inline"
					size="md"
					text="Switching to {$currentNetwork?.displayName || 'network'}..."
				/>
			</div>
		{:else if !$connected}
			<div class="flex min-h-[60vh] items-center justify-center">
				<Section>
					<div class="flex flex-col items-center justify-center gap-6 py-16 px-8">
						<div class="rounded-full bg-gradient-to-br from-blue-600/20 to-purple-700/20 p-6">
							<svg class="h-12 w-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
									d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
							</svg>
						</div>
						<div class="text-center">
							<h2 class="text-2xl font-bold mb-2">Connect Your Wallet</h2>
							<p class="text-gray-400 max-w-md">
								Connect your wallet to access your dashboard and view your portfolio, orders, and vault positions on {$currentNetwork?.displayName || 'this network'}.
							</p>
						</div>
						<WalletConnect />
					</div>
				</Section>
			</div>
		{:else}
			<!-- Dashboard Header -->
			<Section>
				<div class="mb-6">
					<h1 class="text-2xl font-bold">My Dashboard</h1>
					<p class="text-gray-400">{truncateAddress($signerAddress || '')}</p>
				</div>
				
				<!-- Overview Stats -->
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-4">
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Total Value</div>
						<div class="text-2xl font-bold">${totalValue.toFixed(2)}</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">24h Change</div>
						<div class="text-2xl font-bold {totalChange24h >= 0 ? 'text-green-500' : 'text-red-500'}">
							{totalChange24h >= 0 ? '+' : ''}${Math.abs(totalChange24h).toFixed(2)}
						</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Active Orders</div>
						<div class="text-2xl font-bold">{activeOrdersCount}</div>
					</div>
					<div class="rounded-lg border border-white/10 bg-gray-800/50 p-4">
						<div class="text-sm text-gray-400">Active Vaults</div>
						<div class="text-2xl font-bold">{activeVaultsCount}</div>
					</div>
				</div>
			</Section>

			<!-- Tab Navigation -->
			<div class="flex gap-2 border-b border-white/10">
				<button
					on:click={() => (activeTab = 'portfolio')}
					class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'portfolio'
						? 'border-yellow-500 text-yellow-500'
						: 'border-transparent text-gray-400 hover:text-white'}"
				>
					Portfolio
				</button>
				<button
					on:click={() => (activeTab = 'orders')}
					class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'orders'
						? 'border-yellow-500 text-yellow-500'
						: 'border-transparent text-gray-400 hover:text-white'}"
				>
					Orders
				</button>
				<button
					on:click={() => (activeTab = 'vaults')}
					class="border-b-2 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'vaults'
						? 'border-yellow-500 text-yellow-500'
						: 'border-transparent text-gray-400 hover:text-white'}"
				>
					Vaults
				</button>
			</div>

			<!-- Portfolio Tab -->
			{#if activeTab === 'portfolio'}
				<Section>
					<h2 class="mb-4 text-lg font-semibold">Your Holdings</h2>
					{#if $holdingsQuery.isLoading}
						<LoadingSpinner variant="inline" size="md" text="Loading holdings..." />
					{:else if $holdingsQuery.data && $holdingsQuery.data.length > 0}
						<div class="overflow-x-auto">
							<table class="w-full">
								<thead>
									<tr class="border-b border-white/10">
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Token</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Balance</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Price</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400">Value</th>
										<th class="px-4 py-3 text-left text-xs font-medium text-gray-400 hidden sm:table-cell">24h</th>
										<th class="px-4 py-3 text-center text-xs font-medium text-gray-400">Actions</th>
									</tr>
								</thead>
								<tbody>
									{#each $holdingsQuery.data as holding}
										<tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
											<td class="px-4 py-3">
												<div class="flex items-center gap-3">
													<img
														src={ALL_TOKENS.find((s) => s.address.toLowerCase() === holding.address.toLowerCase())?.logoUrl}
														alt={holding.symbol}
														class="h-8 w-8 rounded-full bg-gray-700"
													/>
													<div>
														<div class="font-medium">{holding.symbol}</div>
														<div class="text-xs text-gray-400">{holding.name}</div>
													</div>
												</div>
											</td>
											<td class="px-4 py-3">{parseFloat(holding.balance).toFixed(4)}</td>
											<td class="px-4 py-3">${holding.price.toFixed(2)}</td>
											<td class="px-4 py-3 font-medium">${holding.value.toFixed(2)}</td>
											<td class="px-4 py-3 hidden sm:table-cell">
												<span class="{holding.priceChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}">
													{holding.priceChangePercent >= 0 ? '+' : ''}{holding.priceChangePercent.toFixed(2)}%
												</span>
											</td>
											<td class="px-4 py-3">
												<div class="flex justify-center gap-2">
													<button
														on:click={() => goto(`/trade/${holding.id}`)}
														class="rounded-lg bg-gradient-to-r from-blue-600 to-purple-700 px-3 py-1 text-xs font-semibold text-white transition-transform hover:scale-105"
													>
														Trade
													</button>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<div class="py-12 text-center text-gray-400">
							No holdings found in your wallet.
						</div>
					{/if}
				</Section>

			<!-- Orders Tab -->
			{:else if activeTab === 'orders'}
				<Section>
					<div class="mb-4 flex flex-col items-start gap-3 sm:mb-6 sm:flex-row sm:items-center sm:gap-6">
						<input
							class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none sm:w-auto"
							type="text"
							placeholder="Order hash"
							bind:value={orderHashFilter}
						/>
						<label class="flex w-full items-center gap-2 text-white sm:w-auto">
							<input type="checkbox" bind:checked={showMyOrders} class="accent-yellow-500" />
							<span class="text-xs sm:text-base">Show my orders</span>
						</label>
						<label class="flex w-full items-center gap-2 text-white sm:w-auto">
							<input type="checkbox" bind:checked={ordersActiveFilter} class="accent-yellow-500" />
							<span class="text-xs sm:text-base">Include Inactive orders</span>
						</label>
					</div>
					<OrderListTable query={ordersListQuery} />
				</Section>
			
			<!-- Vaults Tab -->
			{:else if activeTab === 'vaults'}
				<Section>
					{#if $sfts && $sfts.length > 0}
						<div class="mb-6">
							<h2
								class="mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
							>
								About Vaults
							</h2>
							<div
								class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all hover:border-blue-500/30 hover:bg-gray-700/40 sm:p-6"
							>
								<div
									class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
								></div>
								<div class="space-y-4 text-sm text-gray-300 sm:text-base">
									<p>
										Rather than doing token approvals, users deposit their tokens into vaults, which are
										like virtual accounts within the orderbook. Orders reference input/output vaults.
										There can be many inputs and many outputs for an order, e.g. a user could accept a
										number of different stables for WETH.
									</p>
									<p>
										Different orders can also reference the same vaults, which allows for even more
										sophistication when building meta-strategies.
									</p>
									<p>
										For more information, see the <a
											href="https://docs.rainlang.xyz/raindex/overview"
											target="_blank"
											class="text-blue-500 hover:underline">Raindex documentation</a
										>.
									</p>
								</div>
							</div>
						</div>

						<Portfolio vaults={$sfts} tokenGlobalQuote={$tokenGlobalQuote} />

						{#if isProcessingBalances}
							<div class="mb-6 sm:mb-8">
								<h2
									class="mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
								>
									My Vaults
								</h2>
								<div class="flex flex-col items-center justify-center p-8">
									<LoadingSpinner variant="inline" size="md" text="Calculating balances and prices..." />
								</div>
							</div>
						{:else if myTokenBalance.length > 0}
							<div class="mb-6 sm:mb-8">
								<h2
									class="mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
								>
									My Vaults
								</h2>
								<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
									{#each myTokenBalance as token}
										<div
											class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all hover:border-blue-500/30 hover:bg-gray-700/40 sm:p-6"
										>
											<div
												class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
											/>

											<!-- Token Info -->
											<div class="flex items-start gap-3 sm:gap-4">
												<div
													class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-700/20 text-lg font-bold text-white ring-1 ring-white/10 backdrop-blur-sm sm:h-12 sm:w-12 sm:text-xl"
												>
													{token.token.symbol?.slice(0, 2) ?? '??'}
												</div>
												<div class="flex-1">
													<h3 class="text-base font-semibold text-white sm:text-lg">
														{token.token.name ?? 'Unknown Token'}
													</h3>
													<p class="text-xs text-gray-400 sm:text-sm">{token.token.symbol ?? '???'}</p>
												</div>
											</div>

											<!-- Balance Info -->
											<div class="mt-4 space-y-2">
												<div class="flex items-center justify-between">
													<span class="text-xs text-gray-400 sm:text-sm">Total Balance</span>
													<span class="text-base font-semibold text-white sm:text-lg"
														>{token.balance}</span
													>
												</div>
												<div class="flex items-center justify-between">
													<span class="text-xs text-gray-400 sm:text-sm">Price</span>
													<span class="text-xs text-gray-300 sm:text-sm">${token.price}</span>
												</div>
												<div class="flex items-center justify-between">
													<span class="text-xs text-gray-400 sm:text-sm">Estimated Value</span>
													<span class="text-xs font-medium text-green-400 sm:text-sm"
														>${token.estimatedValue}</span
													>
												</div>
												<div class="flex items-center justify-between">
													<span class="text-xs text-gray-400 sm:text-sm">Vaults</span>
													<span class="text-xs text-gray-300 sm:text-sm">{token.vaultIds.length}</span>
												</div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<div class="mb-4 sm:mb-6">
							<label class="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-2">
								<input
									type="checkbox"
									bind:checked={showMyVaults}
									class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-xs text-gray-300 sm:text-sm">Show only my vaults</span>
								<input
									type="checkbox"
									bind:checked={hideEmptyVaults}
									class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
								/>
								<span class="text-xs text-gray-300 sm:text-sm">Hide empty vaults</span>
							</label>
						</div>

						{#if $vaultsListQuery.isLoading}
							<div class="flex flex-col items-center justify-center p-8">
								<LoadingSpinner variant="inline" size="lg" text="Loading Vaults..." />
							</div>
						{:else if $vaultsListQuery.isError}
							<div
								class="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-gray-700/30 p-8 text-center"
							>
								<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/20">
									<svg class="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
										></path>
									</svg>
								</div>
								<h3 class="mb-2 text-lg font-semibold text-white">Error Loading Vaults</h3>
								<p class="text-gray-400">Failed to load vault data. Please try again.</p>
							</div>
						{:else}
							<VaultListTable query={vaultsListQuery} />
						{/if}
					{:else}
						<div class="text-center">
							<h2 class="mb-4 text-xl font-semibold text-gray-400">No SFTs Found</h2>
							<p class="text-gray-500">
								No SFTs available on {$currentNetwork?.displayName || 'this network'}.
							</p>
						</div>
					{/if}
				</Section>
			{/if}
		{/if}
	</div>

	<!-- Footer -->
	<Footer />
</div>