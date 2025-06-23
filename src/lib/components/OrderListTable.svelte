<script lang="ts">
	import {
		Button,
		Table,
		TableBody,
		TableBodyRow,
		TableHeadCell,
		TableBodyCell,
		TableHead
	} from 'flowbite-svelte';
	import type { CreateInfiniteQueryResult, InfiniteData } from '@tanstack/svelte-query';
	import type { SgOrderWithSubgraphName } from '@rainlanguage/orderbook/js_api';
	import LoadingSpinner from './LoadingSpinner.svelte';

	export let query: CreateInfiniteQueryResult<
		InfiniteData<{ orders: SgOrderWithSubgraphName[] }, unknown>,
		Error
	>;
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
	<div class="space-y-4 rounded-lg border border-white/10 bg-gray-700/50 p-4">
		<Table class="rounded-lg bg-gray-800/80">
			<TableHead class="bg-gray-900/90 text-center">
				<TableHeadCell class="text-gray-200">Network</TableHeadCell>
				<TableHeadCell class="text-gray-200">Status</TableHeadCell>
				<TableHeadCell class="text-gray-200">Order ID</TableHeadCell>
				<TableHeadCell class="text-gray-200">Order Owner</TableHeadCell>
				<TableHeadCell class="text-gray-200">Order Book</TableHeadCell>
				<TableHeadCell class="text-gray-200">Last Updated</TableHeadCell>
				<TableHeadCell class="text-gray-200">Inputs</TableHeadCell>
				<TableHeadCell class="text-gray-200">Outputs</TableHeadCell>
				<TableHeadCell class="text-gray-200">Trades</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each $query.data.pages as page}
					{#each page.orders as { order, subgraphName }}
						<TableBodyRow
							class="border-b border-white/10 bg-gray-800/80 text-center text-gray-100 last:border-0"
						>
							<TableBodyCell class="text-gray-200">{subgraphName}</TableBodyCell>
							<TableBodyCell class="px-4 py-3 text-gray-200">
								<span
									class={`rounded px-2 py-1 ${
										order.active
											? 'bg-green-900/50 text-green-400'
											: 'bg-yellow-900/50 text-yellow-400'
									}`}
								>
									{order.active ? 'Active' : 'Inactive'}
								</span>
							</TableBodyCell>
							<TableBodyCell
								><a
									class="text-blue-400 hover:text-blue-300"
									href={`https://v2.raindex.finance/orders/${subgraphName}-${order.orderHash.toString()}`}
									target="_blank"
									>{order.orderHash.toString().slice(0, 6)}...{order.orderHash
										.toString()
										.slice(-4)}</a
								></TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{order.owner.toString().slice(0, 6)}...{order.owner
									.toString()
									.slice(-4)}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{order.orderbook.id.toString().slice(0, 6)}...{order.orderbook.id
									.toString()
									.slice(-4)}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{new Date(
									Number(order.addEvents[0].transaction.timestamp) * 1000
								).toLocaleString()}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{order.inputs.map((input) => input.token.symbol).join(', ')}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{order.outputs.map((output) => output.token.symbol).join(', ')}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{order.trades.length > 99 ? '>99' : order.trades.length}</TableBodyCell
							>
						</TableBodyRow>
					{/each}
				{/each}
			</TableBody>
		</Table>

		{#if $query.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button
					data-testid="loadMoreButton"
					size="sm"
					color="dark"
					class="border border-white/10 bg-gray-700/50 text-white hover:bg-gray-600/50 focus:border-yellow-500/50"
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
