<script lang="ts">
    import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
    import { getVaults } from '@rainlanguage/orderbook/js_api';
    import { createInfiniteQuery } from '@tanstack/svelte-query';
    import type { SgVaultWithSubgraphName } from '@rainlanguage/orderbook/js_api';
	import { ARBITRUM_ORDERBOOK_SUBGRAPH_URL, STOXs, TARGET_NETWORK, USDC_TOKEN } from '$lib/network';
    import { signerAddress } from 'svelte-wagmi';
	import type { Token } from 'sushi/currency';
	import VaultListTable from '$lib/components/VaultListTable.svelte';

    let hideEmptyVaults: boolean | undefined;
	let showMyVaults: boolean | undefined;

    $: vaultsQuery = createInfiniteQuery({
		queryKey: ['vaults', hideEmptyVaults, showMyVaults],
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
				{ page: pageParam + 1, pageSize: 10 }
			);
			return {
				vaults: allVaults,
				hasMore: allVaults.length === 10
			};
		},
		initialPageParam: 0,
		getNextPageParam(lastPage, _allPages, lastPageParam) {
			return lastPage.hasMore ? lastPageParam + 1 : undefined;
		},
		enabled: true
	});

</script>

<div>
	<!-- Header -->
	<div class="sticky top-0 z-40 border-b border-white/10 bg-gray-800/95 px-6 py-4 backdrop-blur-lg">
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<div>
					<h1 class="text-xl font-bold">Orders List</h1>
				</div>
			</div>

			<div class="flex items-center gap-4">
				<WalletConnect />
			</div>
		</div>
	</div>

	<!-- Orders Content -->
	<div class="space-y-8 p-6">
        <div class="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
            <label class="flex items-center gap-2 text-white">
                <input type="checkbox" bind:checked={showMyVaults} class="accent-yellow-500" />
                <span class="text-sm sm:text-base">Show my vaults</span>
            </label>
            <label class="flex items-center gap-2 text-white">
                <input type="checkbox" bind:checked={hideEmptyVaults} class="accent-yellow-500" />
                <span class="text-sm sm:text-base">Hide Empty Vaults</span>
            </label>
        </div>
        <VaultListTable query={vaultsQuery} />
	</div>

	<!-- Footer -->
	<Footer />
</div>