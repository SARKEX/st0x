<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import type { CreateInfiniteQueryResult, InfiniteData } from '@tanstack/svelte-query';
	import type { SgOrderWithSubgraphName } from '@rainlanguage/orderbook';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	// Consolidated table: use native thead/tr/th/td

	export let query: CreateInfiniteQueryResult<
		InfiniteData<{ orders: SgOrderWithSubgraphName[] }, unknown>,
		Error
	>;
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { containerStyles } from '$lib/utils/styles';

	$: console.log($query.data);
</script>

{#if $query.isError}
	<div class="mt-10 flex flex-col items-center justify-start">
		<p class="text-lg font-medium text-red-400">Error loading orders: {$query.error?.message}</p>
	</div>
{:else if $query.isLoading}
	<div class="mt-10 flex flex-col items-center justify-start">
		<LoadingSpinner variant="inline" size="md" text="Loading..." />
	</div>
{:else if $query.data}
	<div class={`${containerStyles.cardBordered} space-y-4`}>
		<Table class="rounded-lg bg-gray-800/80">
			<thead>
				<tr class="border-b border-white/10">
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Network</th
					>
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Status</th
					>
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Order ID</th
					>
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Order Owner</th
					>
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Order Book</th
					>
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Last Updated</th
					>
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Buying</th
					>
					<th
						class="p-2 text-center text-xs font-medium uppercase tracking-wide text-gray-400 sm:p-3"
						>Selling</th
					>
				</tr>
			</thead>
			<tbody>
				{#each $query.data.pages as page}
					{#each page.orders as { order, subgraphName }}
						<tr
							class="border-b border-white/10 bg-gray-800/80 text-center text-gray-100 last:border-0"
						>
							<td class="p-2 text-xs text-gray-200 sm:p-3 sm:text-sm">{subgraphName}</td>
							<td class="px-4 py-3 text-gray-200">
								<span
									class={`rounded px-2 py-1 ${
										order.active
											? 'bg-green-900/50 text-green-400'
											: 'bg-yellow-900/50 text-yellow-400'
									}`}
								>
									{order.active ? 'Active' : 'Inactive'}
								</span>
							</td>
							<td class="p-2 text-xs sm:p-3 sm:text-sm">
								<!-- Mobile: last 6 only -->
								<div class="sm:hidden">
									<ExternalLink
										href={`https://v5.raindex.finance/orders/${
											$currentNetwork.id
										}-${order.orderbook.id.toString()}-${order.orderHash.toString()}`}
										label={order.orderHash.toString()}
										truncate={{ start: 0, end: 6 }}
										className="text-blue-400 hover:text-blue-300"
									/>
								</div>
								<!-- Desktop: 6...4 -->
								<div class="hidden sm:block">
									<ExternalLink
										href={`https://v5.raindex.finance/orders/${
											$currentNetwork.id
										}-${order.orderbook.id.toString()}-${order.orderHash.toString()}`}
										label={order.orderHash.toString()}
										truncate={{ start: 6, end: 4 }}
										className="text-blue-400 hover:text-blue-300"
									/>
								</div>
							</td>
							<td class="p-2 text-xs text-gray-200 sm:p-3 sm:text-sm">
								<span class="sm:hidden">…{order.owner.toString().slice(-6)}</span>
								<span class="hidden sm:inline"
									>{order.owner.toString().slice(0, 6)}...{order.owner.toString().slice(-4)}</span
								>
							</td>
							<td class="p-2 text-xs text-gray-200 sm:p-3 sm:text-sm">
								<span class="sm:hidden">…{order.orderbook.id.toString().slice(-6)}</span>
								<span class="hidden sm:inline"
									>{order.orderbook.id.toString().slice(0, 6)}...{order.orderbook.id
										.toString()
										.slice(-4)}</span
								>
							</td>
							<td class="p-2 text-xs text-gray-200 sm:p-3 sm:text-sm"
								>{new Date(Number(order.timestampAdded) * 1000).toLocaleString()}</td
							>
							<td class="p-2 text-xs text-gray-200 sm:p-3 sm:text-sm"
								>{order.inputs.map((input) => input.token.symbol).join(', ')}</td
							>
							<td class="p-2 text-xs text-gray-200 sm:p-3 sm:text-sm"
								>{order.outputs.map((output) => output.token.symbol).join(', ')}</td
							>
						</tr>
					{/each}
				{/each}
			</tbody>
		</Table>

		{#if $query.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					dataTestId="loadMoreButton"
					size="sm"
					variant="secondary"
					on:click={() => $query.fetchNextPage()}
					disabled={$query.isFetchingNextPage}
				>
					{#if $query.isFetchingNextPage}
						<LoadingSpinner variant="button" size="sm" text="Loading more..." showText={true} />
					{:else}
						Load More
					{/if}
				</Button>
			</div>
		{/if}
	</div>
{/if}
