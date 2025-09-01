<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { getVaults } from '@rainlanguage/orderbook';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { SgErc20, SgVaultWithSubgraphName } from '@rainlanguage/orderbook';
	import { signerAddress } from 'svelte-wagmi';
	import VaultListTable from '$lib/components/VaultListTable.svelte';
	import { formatUnits } from 'viem';
	import Portfolio from '$lib/components/Portfolio.svelte';
	import { sfts, tokenGlobalQuote } from '$lib/stores';
	import type { ApiStockQuote } from '$lib/types';
	import { getPrice } from '$lib/getPrice';
	import { Token } from 'sushi/currency';
	import { arbitrum } from '@wagmi/core/chains';
	import { currentNetwork } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	const VAULT_LIST_PAGE_SIZE = 1000;

	let hideEmptyVaults: boolean | undefined = false;
	let showMyVaults: boolean | undefined = false;
	let isProcessingBalances = false;

	let myTokenBalance: {
		token: SgErc20;
		balance: string;
		vaultIds: string[];
		price: string;
		estimatedValue: string;
	}[] = [];

	$: vaultsQuery = createInfiniteQuery({
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
		enabled: true
	});

	$: if ($vaultsQuery.data?.pages[0]?.vaults) {
		// Create a map to aggregate balances by token address
		const tokenBalances = new Map<
			string,
			{
				token: SgErc20;
				totalBalance: bigint;
				vaultIds: string[];
			}
		>();

		for (const { vault } of $vaultsQuery.data.pages[0].vaults) {
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
				const tokenSymbol = token.symbol?.includes('s1')
					? token.symbol?.split('s1')[0]
					: token.symbol?.split('0x')[0];
				const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
					(q) => q?.['Global Quote']?.['01. symbol'] === tokenSymbol
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
</script>

{#if !$sfts}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner
			variant="fullscreen"
			size="lg"
			text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..."
		/>
	</div>
{:else if $sfts.length > 0}
	<div>
		<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
			<div class="mb-6 sm:mb-8">
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
		</div>
		<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
			<Portfolio vaults={$sfts} tokenGlobalQuote={$tokenGlobalQuote} />
		</div>

		<!-- Orders Content -->
		<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
			{#if $vaultsQuery.isLoading}
				<div class="mb-6 sm:mb-8">
					<h2
						class="mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-xl font-bold text-transparent sm:text-2xl"
					>
						My Vaults
					</h2>
					<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
						<!-- eslint-disable-next-line-->
						{#each Array(3) as _}
							<div
								class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-4 transition-all sm:p-6"
							>
								<div class="flex items-start gap-3 sm:gap-4">
									<div
										class="flex h-10 w-10 flex-shrink-0 animate-pulse items-center justify-center rounded-xl bg-gray-600/50 sm:h-12 sm:w-12"
									></div>
									<div class="flex-1">
										<div class="mb-2 h-5 w-24 animate-pulse rounded bg-gray-600/50"></div>
										<div class="h-4 w-16 animate-pulse rounded bg-gray-600/50"></div>
									</div>
								</div>
								<div class="mt-4 space-y-2">
									<!-- eslint-disable-next-line-->
									{#each Array(4) as _, i (i)}
										<div class="flex items-center justify-between">
											<div class="h-4 w-20 animate-pulse rounded bg-gray-600/50"></div>
											<div class="h-4 w-16 animate-pulse rounded bg-gray-600/50"></div>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{:else if isProcessingBalances}
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

			{#if $vaultsQuery.isLoading}
				<div class="flex flex-col items-center justify-center p-8">
					<LoadingSpinner variant="inline" size="lg" text="Loading Vaults..." />
				</div>
			{:else if $vaultsQuery.isError}
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
				<VaultListTable query={vaultsQuery} />
			{/if}
		</div>

		<!-- Footer -->
		<Footer />
	</div>
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<div class="text-center">
			<h2 class="mb-4 text-xl font-semibold text-gray-400">No SFTs Found</h2>
			<p class="text-gray-500">
				No SFTs available on {$currentNetwork?.displayName || 'this network'}.
			</p>
		</div>
	</div>
{/if}
