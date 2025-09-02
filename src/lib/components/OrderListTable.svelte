<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import type { CreateInfiniteQueryResult, InfiniteData } from '@tanstack/svelte-query';
	import type { SgOrderWithSubgraphName } from '@rainlanguage/orderbook';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import TableHead from '$lib/components/ui/table/TableHead.svelte';
	import TableRow from '$lib/components/ui/table/TableRow.svelte';
	import TableCell from '$lib/components/ui/table/TableCell.svelte';

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
			<thead>
				<TableRow isHeader>
					<TableHead align="center">Network</TableHead>
					<TableHead align="center">Status</TableHead>
					<TableHead align="center">Order ID</TableHead>
					<TableHead align="center">Order Owner</TableHead>
					<TableHead align="center">Order Book</TableHead>
					<TableHead align="center">Last Updated</TableHead>
					<TableHead align="center">Inputs</TableHead>
					<TableHead align="center">Outputs</TableHead>
					<TableHead align="center">Trades</TableHead>
				</TableRow>
			</thead>
			<tbody>
				{#each $query.data.pages as page}
					{#each page.orders as { order, subgraphName }}
						<TableRow className="border-b border-white/10 bg-gray-800/80 text-center text-gray-100 last:border-0">
							<TableCell className="text-gray-200">{subgraphName}</TableCell>
							<TableCell className="px-4 py-3 text-gray-200">
								<span class={`rounded px-2 py-1 ${order.active ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
									{order.active ? 'Active' : 'Inactive'}
								</span>
							</TableCell>
							<TableCell>
								<a
									class="text-blue-400 hover:text-blue-300"
									href={`https://v2.raindex.finance/orders/${$currentNetwork.id}-${order.orderbook.id.toString()}-${order.orderHash.toString()}`}
									target="_blank"
								>
									{order.orderHash.toString().slice(0, 6)}...{order.orderHash.toString().slice(-4)}
								</a>
							</TableCell>
							<TableCell className="text-gray-200">{order.owner.toString().slice(0, 6)}...{order.owner.toString().slice(-4)}</TableCell>
							<TableCell className="text-gray-200">{order.orderbook.id.toString().slice(0, 6)}...{order.orderbook.id.toString().slice(-4)}</TableCell>
							<TableCell className="text-gray-200">{new Date(Number(order.addEvents[0].transaction.timestamp) * 1000).toLocaleString()}</TableCell>
							<TableCell className="text-gray-200">{order.inputs.map((input) => input.token.symbol).join(', ')}</TableCell>
							<TableCell className="text-gray-200">{order.outputs.map((output) => output.token.symbol).join(', ')}</TableCell>
							<TableCell className="text-gray-200">{order.trades.length > 99 ? '>99' : order.trades.length}</TableCell>
						</TableRow>
					{/each}
				{/each}
			</tbody>
		</Table>

		{#if $query.hasNextPage}
			<div class="mt-4 flex justify-center">
				<Button dataTestId="loadMoreButton" size="sm" variant="secondary" on:click={() => $query.fetchNextPage()} disabled={$query.isFetchingNextPage}>
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
