<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { connected, signerAddress } from 'svelte-wagmi';
	import { currentNetwork, sfts, tokenGlobalQuote } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import TabNav from '$lib/components/ui/TabNav.svelte';
	import MetricCard from '$lib/components/ui/MetricCard.svelte';
	import WalletConnectionPrompt from '$lib/components/ui/WalletConnectionPrompt.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { truncateAddress } from '$lib/utils/format';
	import { textStyles, gridStyles } from '$lib/styles/utils';
	import { createQuery } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import { getAllTokensByNetwork } from '$lib/config/network';
	import { goto } from '$app/navigation';
	import { createRaindexClient } from '$lib/api/raindex';
	import type {
		SgOrderWithSubgraphName,
		SgErc20,
		SgVault,
		RaindexVault
	} from '@rainlanguage/orderbook';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import OrderListTable from '$lib/components/OrderListTable.svelte';
	import VaultListTable from '$lib/components/VaultListTable.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { findQuoteForSymbol } from '$lib/utils/tradingViewSymbols';

	function isPaymentTokenPosition(token: { token: SgErc20 }) {
		const settlementToken = $currentNetwork?.defaultPaymentToken;
		if (!settlementToken) return false;
		const symbolMatch = token.token.symbol?.toUpperCase() === settlementToken.symbol?.toUpperCase();
		const addressMatch = token.token.id?.toLowerCase() === settlementToken.address?.toLowerCase();
		return Boolean(symbolMatch || addressMatch);
	}

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let isNetworkLoading = false;
	const DASHBOARD_TABS = [
		{ id: 'portfolio', label: 'Portfolio' },
		{ id: 'orders', label: 'Orders' },
		{ id: 'vaults', label: 'Vaults' }
	] as const;
	type DashboardTabId = (typeof DASHBOARD_TABS)[number]['id'];
	let activeTab: DashboardTabId = 'portfolio';

	const handleDashboardTabChange = (event: CustomEvent<{ id: string }>) => {
		const nextId = event.detail.id;
		if (DASHBOARD_TABS.some((tab) => tab.id === nextId)) {
			activeTab = nextId as DashboardTabId;
		}
	};

	// Order List variables
	let ordersActiveFilter: boolean | undefined = undefined; // Show inactive orders by default
	let orderHashFilter: string | undefined = undefined;
	let showMyOrders = true; // Always show only user's orders
	const ORDER_LIST_PAGE_SIZE = 1000;

	// Vault List variables
	let hideEmptyVaults: boolean | undefined = false;
	let showMyVaults: boolean | undefined = true; // Default to showing only user's vaults
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
					(holder) => holder.address.toLowerCase() === $signerAddress.toLowerCase()
				);

				if (userHolder && BigInt(userHolder.balance) > 0n) {
					const quote = findQuoteForSymbol(sft.symbol, $tokenGlobalQuote, ALL_TOKENS);
					const price = quote?.close ?? 0;
					const priceChange = quote?.change ?? 0;
					const priceChangePercent = quote?.changePercent ?? 0;

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
		return sum + holding.priceChange * parseFloat(holding.balance);
	}, 0);
	$: activeOrdersCount =
		$ordersListQuery?.data?.pages?.reduce((sum, page) => sum + page.orders.length, 0) || 0;
	$: activeVaultsCount = myTokenBalance?.filter((v) => parseFloat(v.balance) > 0).length || 0;

	// Order List Query
	$: ordersListQuery = createInfiniteQuery({
		queryKey: ['orders', $currentNetwork?.id, ordersActiveFilter, orderHashFilter, showMyOrders],
		queryFn: async ({ pageParam }) => {
			const client = await createRaindexClient();
			const filterTokens = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

			const ordersResult = await client.getOrders(
				[$currentNetwork.id],
				{
					owners: $signerAddress ? ([$signerAddress.toLowerCase()] as `0x${string}`[]) : [],
					active: ordersActiveFilter,
					orderHash:
						orderHashFilter === '' ? undefined : (orderHashFilter as unknown as `0x${string}`),
					tokens: filterTokens.map((token) => token.address) as `0x${string}`[]
				},
				pageParam + 1
			);
			if (ordersResult.error) throw new Error(ordersResult.error.readableMsg);

			// Convert RaindexOrder[] to SgOrderWithSubgraphName[]
			const allOrders: SgOrderWithSubgraphName[] = await Promise.all(
				ordersResult.value.map(async (order) => {
					const sgOrderResult = order.convertToSgOrder();
					if (sgOrderResult.error || !sgOrderResult.value) {
						throw new Error('Failed to convert order');
					}
					return {
						order: sgOrderResult.value,
						subgraphName: $currentNetwork.raindexNetworkSlug
					};
				})
			);

			return {
				orders: allOrders,
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
			const client = await createRaindexClient();

			const vaultsResult = await client.getVaults(
				[$currentNetwork.id],
				{
					owners: $signerAddress ? ([$signerAddress.toLowerCase()] as `0x${string}`[]) : [],
					hideZeroBalance: hideEmptyVaults ?? false
				},
				pageParam + 1
			);
			if (vaultsResult.error) throw new Error(vaultsResult.error.readableMsg);

			// Convert RaindexVaultsList.items (RaindexVault[]) to objects with vault, raindexVault, and subgraphName
			const allVaults: { vault: SgVault; raindexVault: RaindexVault; subgraphName: string }[] =
				vaultsResult.value.items.map((vault) => {
					let vaultBalanceFloat = vault.balance.toFixedDecimalLossy(Number(vault.token.decimals));
					if (vaultBalanceFloat.error) throw new Error(vaultBalanceFloat.error.readableMsg);

					// Convert RaindexVault to SgVault
					const sgVault: SgVault = {
						id: vault.id as `0x${string}`,
						owner: vault.owner,
						vaultId: `0x${vault.vaultId.toString(16).padStart(64, '0')}`,
						balance: vaultBalanceFloat.value!.value.toString(),
						token: {
							id: vault.token.id as `0x${string}`,
							address: vault.token.address,
							name: vault.token.name,
							symbol: vault.token.symbol,
							decimals: vault.token.decimals.toString() as `0x${string}`
						},
						orderbook: {
							id: vault.orderbook
						},
						ordersAsOutput: vault.ordersAsOutput,
						ordersAsInput: vault.ordersAsInput,
						balanceChanges: []
					};
					return {
						vault: sgVault,
						raindexVault: vault,
						subgraphName: $currentNetwork.raindexNetworkSlug
					};
				});
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
	$: if ($vaultsListQuery?.data?.pages?.[0]?.vaults && activeTab === 'vaults') {
		// Create a map to aggregate balances by token address
		const tokenBalances = new Map<
			string,
			{
				token: SgErc20;
				totalBalance: bigint;
				vaultIds: string[];
			}
		>();

		for (const { vault } of $vaultsListQuery?.data?.pages?.[0]?.vaults || []) {
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
				const settlementToken = $currentNetwork?.defaultPaymentToken;
				if (!settlementToken) {
					const balance = parseFloat(formatUnits(totalBalance, Number(token.decimals ?? 18)));
					return {
						token,
						balance: balance.toFixed(6),
						vaultIds,
						price: '0.000000',
						estimatedValue: '0.000000',
						isPaymentToken: false
					};
				}
				const settlementSymbol = settlementToken.symbol?.toUpperCase();
				const settlementAddress = settlementToken.address?.toLowerCase();
				const isPaymentToken =
					token.symbol?.toUpperCase() === settlementSymbol ||
					token.id.toLowerCase() === settlementAddress;

				const quote = findQuoteForSymbol(token.symbol, $tokenGlobalQuote, ALL_TOKENS);

				let price: number | null = quote?.close ?? null;

				if (!price || !Number.isFinite(price) || price <= 0) {
					if (isPaymentToken) {
						price = 1;
					} else {
						price = 0;
					}
				}

				const balance = parseFloat(formatUnits(totalBalance, Number(token.decimals ?? 18)));
				const estimatedValue = (price * balance).toFixed(6);

				return {
					token,
					balance: balance.toFixed(6),
					vaultIds,
					price: price.toFixed(6),
					estimatedValue,
					isPaymentToken
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
</script>

<!-- Main Content -->
<div>
	<PageContainer>
		{#if isNetworkLoading}
			<div class="flex flex-col items-center justify-center gap-4 py-8">
				<LoadingSpinner
					variant="inline"
					size="md"
					text="Switching to {$currentNetwork?.displayName || 'network'}..."
				/>
			</div>
		{:else if !$connected}
			<WalletConnectionPrompt
				description="Connect your wallet to access your dashboard and view your portfolio, orders, and vault positions on {$currentNetwork?.displayName ||
					'this network'}."
			/>
		{:else}
			<!-- Dashboard Header -->
			<Section>
				<div class="mb-6">
					<h1 class="text-2xl font-bold">My Dashboard</h1>
					<p class="text-gray-400">
						<span class="sm:hidden">…{($signerAddress || '').slice(-6)}</span>
						<span class="hidden sm:inline">{truncateAddress($signerAddress || '')}</span>
					</p>
				</div>

				<!-- Overview Stats -->
				<div class={gridStyles.responsive4}>
					<MetricCard
						label="Total Value"
						value={`$${totalValue.toFixed(2)}`}
						cardClass="bg-gray-800/50 border border-white/10"
						paddingClass="p-4"
						showGradient={false}
						valueClass="text-2xl font-bold"
					/>
					<MetricCard
						label="24h Change"
						value={`${totalChange24h >= 0 ? '+' : ''}$${Math.abs(totalChange24h).toFixed(2)}`}
						cardClass="bg-gray-800/50 border border-white/10"
						paddingClass="p-4"
						showGradient={false}
						change=""
						valueClass={`text-2xl font-bold ${
							totalChange24h >= 0 ? 'text-green-500' : 'text-red-500'
						}`}
					/>
					<MetricCard
						label="Active Orders"
						value={`${activeOrdersCount}`}
						cardClass="bg-gray-800/50 border border-white/10"
						paddingClass="p-4"
						showGradient={false}
						valueClass="text-2xl font-bold"
					/>
					<MetricCard
						label="Active Vaults"
						value={`${activeVaultsCount}`}
						cardClass="bg-gray-800/50 border border-white/10"
						paddingClass="p-4"
						showGradient={false}
						valueClass="text-2xl font-bold"
					/>
				</div>
			</Section>

			<!-- Tab Navigation -->
			<TabNav activeId={activeTab} on:change={handleDashboardTabChange} tabs={DASHBOARD_TABS} />

			<!-- Portfolio Tab -->
			{#if activeTab === 'portfolio'}
				<Section>
					<h2 class="mb-4 text-lg font-semibold">Your Holdings</h2>
					{#if $holdingsQuery.isLoading}
						<LoadingSpinner variant="inline" size="md" text="Loading holdings..." />
					{:else if $holdingsQuery.data && $holdingsQuery.data.length > 0}
						<div class="overflow-x-auto">
							<Table>
								<thead>
									<tr class="border-b border-white/10">
										<th
											class="sticky left-0 z-10 bg-gray-800 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											>Token</th
										>
										<th
											class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											>Balance</th
										>
										<th
											class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											>Price</th
										>
										<th
											class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											>Value</th
										>
										<th
											class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											>24h</th
										>
										<th
											class="px-2 py-2 text-center text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
											>Actions</th
										>
									</tr>
								</thead>
								<tbody>
									{#each $holdingsQuery.data as holding}
										<tr>
											<td class="sticky left-0 bg-gray-800 px-2 py-2 sm:px-4 sm:py-3">
												<TokenDisplay
													logoUrl={ALL_TOKENS.find(
														(s) => s.address.toLowerCase() === holding.address.toLowerCase()
													)?.logoUrl}
													symbol={holding.symbol}
													name={holding.name}
												/>
											</td>
											<td class="px-2 py-2 sm:px-4 sm:py-3"
												>{parseFloat(holding.balance).toFixed(4)}</td
											>
											<td class="px-2 py-2 sm:px-4 sm:py-3">${holding.price.toFixed(2)}</td>
											<td class="px-2 py-2 font-medium sm:px-4 sm:py-3"
												>${holding.value.toFixed(2)}</td
											>
											<td class="px-2 py-2 sm:px-4 sm:py-3">
												<span
													class={holding.priceChangePercent >= 0
														? 'text-green-500'
														: 'text-red-500'}
												>
													{holding.priceChangePercent >= 0
														? '+'
														: ''}{holding.priceChangePercent.toFixed(2)}%
												</span>
											</td>
											<td class="px-4 py-3">
												<div class="flex justify-center gap-2">
													<Button
														size="sm"
														variant="primary"
														on:click={() => goto(`/trade/${holding.id}`)}>Trade</Button
													>
												</div>
											</td>
										</tr>
									{/each}
								</tbody>
							</Table>
						</div>
					{:else}
						<EmptyState description="No holdings found in your wallet." />
					{/if}
				</Section>

				<!-- Orders Tab -->
			{:else if activeTab === 'orders'}
				<Section>
					<div
						class="mb-4 flex flex-col items-start gap-3 sm:mb-6 sm:flex-row sm:items-center sm:gap-6"
					>
						<input
							id="orderHash"
							type="search"
							placeholder="Order hash"
							bind:value={orderHashFilter}
							class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none sm:w-auto"
						/>
						<label class="flex w-full items-center gap-2 text-white sm:w-auto">
							<input type="checkbox" bind:checked={ordersActiveFilter} class="accent-yellow-500" />
							<span class="text-xs sm:text-base">Show active orders only</span>
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
										Rather than doing token approvals, users deposit their tokens into vaults, which
										are like virtual accounts within the orderbook. Orders reference input/output
										vaults. There can be many inputs and many outputs for an order, e.g. a user
										could accept a number of different stables for WETH.
									</p>
									<p>
										Different orders can also reference the same vaults, which allows for even more
										sophistication when building meta-strategies.
									</p>
									<p>
										For more information, see the
										<ExternalLink
											href="https://docs.rainlang.xyz/raindex/overview"
											label="Raindex documentation"
											className="text-blue-500 hover:underline"
										/>
										.
									</p>
								</div>
							</div>
						</div>

						{#if isProcessingBalances}
							<div class="mb-6 sm:mb-8">
								<h2
									class="mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
								>
									My Vault Holdings
								</h2>
								<div class="flex flex-col items-center justify-center p-8">
									<LoadingSpinner
										variant="inline"
										size="md"
										text="Calculating balances and prices..."
									/>
								</div>
							</div>
						{:else if myTokenBalance.length > 0}
							<div class="mb-6 sm:mb-8">
								<h2
									class="mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
								>
									My Vault Holdings
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
													class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl {isPaymentTokenPosition(
														token
													)
														? 'bg-gradient-to-br from-green-600/20 to-emerald-700/20'
														: 'bg-gradient-to-br from-blue-600/20 to-purple-700/20'} text-lg font-bold text-white ring-1 ring-white/10 backdrop-blur-sm sm:h-12 sm:w-12 sm:text-xl"
												>
													{token.token.symbol?.slice(0, 2) ?? '??'}
												</div>
												<div class="flex-1">
													<h3 class="text-base font-semibold text-white sm:text-lg">
														{token.token.name ?? 'Unknown Token'}
													</h3>
													<div class="flex items-center gap-2">
														<p class="{textStyles.label} sm:text-sm">
															{token.token.symbol ?? '???'}
														</p>
														{#if isPaymentTokenPosition(token)}
															<span
																class="rounded-full bg-green-500/20 px-2 py-0.5 text-[10px] font-medium text-green-400"
															>
																Stablecoin
															</span>
														{/if}
													</div>
												</div>
											</div>

											<!-- Balance Info -->
											<div class="mt-4 space-y-2">
												<div class="flex items-center justify-between">
													<span class="{textStyles.label} sm:text-sm">Total Balance</span>
													<span class="text-base font-semibold text-white sm:text-lg"
														>{token.balance}</span
													>
												</div>
												<div class="flex items-center justify-between">
													<span class="{textStyles.label} sm:text-sm">Price</span>
													<span class="text-xs text-gray-300 sm:text-sm">${token.price}</span>
												</div>
												<div class="flex items-center justify-between">
													<span class="{textStyles.label} sm:text-sm">Estimated Value</span>
													<span
														class="text-xs font-medium {isPaymentTokenPosition(token)
															? 'text-emerald-400'
															: 'text-green-400'} sm:text-sm">${token.estimatedValue}</span
													>
												</div>
												<div class="flex items-center justify-between">
													<span class="{textStyles.label} sm:text-sm">Vaults</span>
													<span class="text-xs text-gray-300 sm:text-sm"
														>{token.vaultIds.length}</span
													>
												</div>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<div class="mb-4 sm:mb-6">
							<label class="flex w-full items-center gap-2">
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
								<div
									class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/20"
								>
									<svg
										class="h-8 w-8 text-red-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
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
	</PageContainer>

	<!-- Footer -->
	<Footer />
</div>
