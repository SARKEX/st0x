<script lang="ts">
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { getOrders } from '@rainlanguage/orderbook/js_api';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import type { SgOrderWithSubgraphName } from '@rainlanguage/orderbook/js_api';
	import { ARBITRUM_ORDERBOOK_SUBGRAPH_URL, STOXs, TARGET_NETWORK, USDC_TOKEN } from '$lib/network';
	import { signerAddress } from 'svelte-wagmi';
	import type { Token } from 'sushi/currency';
	import OrderListTable from '$lib/components/OrderListTable.svelte';

	const TOKENS: Token[] = STOXs.concat(USDC_TOKEN);

	let ordersActiveFilter: boolean | undefined = false;
	let orderHashFilter: string | undefined = undefined;
	let showMyOrders = false;

	$: ordersQuery = createInfiniteQuery({
		queryKey: ['orders', ordersActiveFilter, orderHashFilter, showMyOrders],
		queryFn: async ({ pageParam }) => {
			const allOrders: SgOrderWithSubgraphName[] = await getOrders(
				[
					{
						url: ARBITRUM_ORDERBOOK_SUBGRAPH_URL,
						name: TARGET_NETWORK
					}
				],
				{
					owners: showMyOrders ? ($signerAddress ? [$signerAddress.toLowerCase()] : []) : [],
					active: ordersActiveFilter ? undefined : true,
					orderHash: orderHashFilter === '' ? undefined : orderHashFilter
				},
				{ page: pageParam + 1, pageSize: 10 }
			);

			// Filter orders that have any token from forexTokenList in either inputs or outputs
			const filteredOrders = allOrders.filter(({ order }) => {
				const inputAddresses = order.inputs.map((input) => input.token.address.toLowerCase());
				const outputAddresses = order.outputs.map((output) => output.token.address.toLowerCase());
				const filterAddresses = TOKENS.map((token) => token.address.toLowerCase());
				const hasTokenInInputs = inputAddresses.some((addr) => filterAddresses.includes(addr));
				const hasTokenInOutputs = outputAddresses.some((addr) => filterAddresses.includes(addr));
				return hasTokenInInputs || hasTokenInOutputs;
			});

			return {
				orders: filteredOrders,
				hasMore: allOrders.length === 10
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
			<input
				class="w-full rounded-lg border border-white/10 bg-gray-700/50 px-4 py-3 text-white transition-colors focus:border-yellow-500/50 focus:outline-none sm:w-auto"
				type="text"
				placeholder="Order hash"
				bind:value={orderHashFilter}
			/>
			<label class="flex items-center gap-2 text-white">
				<input type="checkbox" bind:checked={showMyOrders} class="accent-yellow-500" />
				<span class="text-sm sm:text-base">Show my orders</span>
			</label>
			<label class="flex items-center gap-2 text-white">
				<input type="checkbox" bind:checked={ordersActiveFilter} class="accent-yellow-500" />
				<span class="text-sm sm:text-base">Include Inactive orders</span>
			</label>
		</div>
		<OrderListTable query={ordersQuery} />
	</div>

	<!-- Footer -->
	<Footer />
</div>
