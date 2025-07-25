<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { getOrders } from '@rainlanguage/orderbook';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { SgOrderWithSubgraphName } from '@rainlanguage/orderbook';
	import { TOKENS, getAllTokensByNetwork } from '$lib/network';
	import { currentNetwork } from '$lib/stores';
	import { signerAddress } from 'svelte-wagmi';
	import type { Token } from 'sushi/currency';
	import OrderListTable from '$lib/components/OrderListTable.svelte';
	import Header from '$lib/components/Header.svelte';

	// Filter tokens based on current network
	$: ALL_TOKENS = getAllTokensByNetwork($currentNetwork.id);
	const ORDER_LIST_PAGE_SIZE = 1000;

	let ordersActiveFilter: boolean | undefined = false;
	let orderHashFilter: string | undefined = undefined;
	let showMyOrders = true;

	$: ordersQuery = createInfiniteQuery({
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
		enabled: !!$currentNetwork?.orderbook_subgraph_url
	});
</script>

<div>
	<!-- Orders Content -->
	<div class="space-y-6 p-4 sm:space-y-8 sm:p-6">
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
		<OrderListTable query={ordersQuery} />
	</div>

	<!-- Footer -->
	<Footer />
</div>
