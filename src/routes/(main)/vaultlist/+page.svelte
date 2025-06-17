<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { getVaults } from '@rainlanguage/orderbook/js_api';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { SgErc20, SgVaultWithSubgraphName } from '@rainlanguage/orderbook/js_api';
	import { ARBITRUM_ORDERBOOK_SUBGRAPH_URL, TARGET_NETWORK } from '$lib/network';
	import { signerAddress } from 'svelte-wagmi';
	import VaultListTable from '$lib/components/VaultListTable.svelte';
	import { formatUnits } from 'viem';

	const VAULT_LIST_PAGE_SIZE = 1000;

	let hideEmptyVaults: boolean | undefined = true;
	let showMyVaults: boolean | undefined = true;

	let myTokenBalance: {
		token: SgErc20;
		balance: string;
		vaultIds: string[];
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
		myTokenBalance = Array.from(tokenBalances.values()).map(
			({ token, totalBalance, vaultIds }) => ({
				token,
				balance: formatUnits(totalBalance, Number(token.decimals ?? 18)),
				vaultIds
			})
		);
	}
</script>

<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Vault List</h1>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Orders Content -->
	<div class="space-y-8 p-6">
		{#if myTokenBalance.length > 0}
			<div class="mb-8">
				<h2
					class="mb-4 bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-2xl font-bold text-transparent"
				>
					My Portfolio
				</h2>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each myTokenBalance as token}
						<div
							class="group relative overflow-hidden rounded-xl border border-white/5 bg-gray-700/30 p-6 transition-all hover:border-blue-500/30 hover:bg-gray-700/40"
						>
							<div
								class="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-purple-700 via-blue-600 to-yellow-500 opacity-0 transition-opacity group-hover:opacity-100"
							/>

							<!-- Token Info -->
							<div class="flex items-start gap-4">
								<div
									class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-700/20 text-xl font-bold text-white ring-1 ring-white/10 backdrop-blur-sm"
								>
									{token.token.symbol?.slice(0, 2) ?? '??'}
								</div>
								<div class="flex-1">
									<h3 class="text-lg font-semibold text-white">
										{token.token.name ?? 'Unknown Token'}
									</h3>
									<p class="text-sm text-gray-400">{token.token.symbol ?? '???'}</p>
								</div>
							</div>

							<!-- Balance Info -->
							<div class="mt-4 space-y-2">
								<div class="flex items-center justify-between">
									<span class="text-sm text-gray-400">Total Balance</span>
									<span class="text-lg font-semibold text-white">{token.balance}</span>
								</div>
								<div class="flex items-center justify-between">
									<span class="text-sm text-gray-400">Vaults</span>
									<span class="text-sm text-gray-300">{token.vaultIds.length}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="mb-6">
			<label class="flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={showMyVaults}
					class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-300">Show only my vaults</span>
				<input
					type="checkbox"
					bind:checked={hideEmptyVaults}
					class="h-4 w-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
				/>
				<span class="text-sm text-gray-300">Hide empty vaults</span>
			</label>
		</div>

		<VaultListTable query={vaultsQuery} />
	</div>

	<!-- Footer -->
	<Footer />
</div>
