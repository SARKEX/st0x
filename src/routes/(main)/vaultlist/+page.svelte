<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { getVaults } from '@rainlanguage/orderbook/js_api';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { SgErc20, SgVaultWithSubgraphName } from '@rainlanguage/orderbook/js_api';
	import { ARBITRUM_ORDERBOOK_SUBGRAPH_URL, TARGET_NETWORK, USDC_TOKEN } from '$lib/network';
	import { signerAddress } from 'svelte-wagmi';
	import VaultListTable from '$lib/components/VaultListTable.svelte';
	import { formatUnits } from 'viem';
	import Portfolio from '$lib/components/Portfolio.svelte';
	import { sfts, tokenGlobalQuote } from '$lib/stores';

	import Header from '$lib/components/Header.svelte';
	import type { ApiStockQuote } from '$lib/types';
	import { getPrice } from '$lib/getPrice';
	import { Token } from 'sushi/currency';
	import { arbitrum } from '@wagmi/core/chains';

	const VAULT_LIST_PAGE_SIZE = 1000;

	let hideEmptyVaults: boolean | undefined = true;
	let showMyVaults: boolean | undefined = true;

	let myTokenBalance: {
		token: SgErc20;
		balance: string;
		vaultIds: string[];
		price: string;
		estimatedValue: string;
	}[] = [];

	$: vaultsQuery = createInfiniteQuery({
		queryKey: ['vaults', hideEmptyVaults, showMyVaults, $signerAddress],
		queryFn: async ({ pageParam }) => {
			const allVaults: SgVaultWithSubgraphName[] = await getVaults(
				[
					{
						url: ARBITRUM_ORDERBOOK_SUBGRAPH_URL,
						name: TARGET_NETWORK
					}
				],
				{
					owners: showMyVaults ? ($signerAddress ? [$signerAddress.toLowerCase()] : []) : [],
					hideZeroBalance: hideEmptyVaults ?? false
				},
				{ page: pageParam + 1, pageSize: VAULT_LIST_PAGE_SIZE }
			);
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
						USDC_TOKEN
					);
					price = parseFloat(priceStr);
				}

				const balance = parseFloat(formatUnits(totalBalance, Number(token.decimals ?? 18)));
				const estimatedValue = (price * balance).toFixed(2);

				return {
					token,
					balance: balance.toFixed(4),
					vaultIds,
					price: price.toFixed(2),
					estimatedValue
				};
			}
		);
		Promise.all(balancePromises).then((balances) => {
			myTokenBalance = balances;
		});
	}
</script>

<div>
	<!-- Header -->
	<Header title="Vault List" description="View all vaults" />

	<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
		<Portfolio vaults={$sfts} tokenGlobalQuote={$tokenGlobalQuote} />
	</div>

	<!-- Orders Content -->
	<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
		{#if myTokenBalance.length > 0}
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
									<span class="text-base font-semibold text-white sm:text-lg">{token.balance}</span>
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

		<VaultListTable query={vaultsQuery} />
	</div>

	<!-- Footer -->
	<Footer />
</div>
