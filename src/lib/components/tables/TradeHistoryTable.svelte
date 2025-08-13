<script lang="ts">
	import type { SgTrade } from '@rainlanguage/orderbook';
	import type { CreateInfiniteQueryResult, InfiniteData } from '@tanstack/svelte-query';
	import { formatUnits } from 'viem';
	import Button from '../Button.svelte';
	import { Spinner } from 'flowbite-svelte';
	import LoadingSpinner from '../LoadingSpinner.svelte';
	import { currentNetwork } from '$lib/stores';
	import { derived } from 'svelte/store';
	export let query: CreateInfiniteQueryResult<InfiniteData<{ trades: SgTrade[] }, unknown>, Error>;

	const sortedTrades = derived(query, ($query) => {
		if (!$query.data?.pages) return [];
		const allTrades = $query.data.pages.flatMap((page) => page.trades);
		return allTrades.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp));
	});

	function formatTimestamp(timestamp: string): string {
		return new Date(parseInt(timestamp) * 1000).toLocaleString();
	}
</script>

{#if $query.isError}
	<div class="mt-10 flex flex-col items-center justify-start">
		<p class="text-lg font-medium text-red-400">Error loading trades: {$query.error?.message}</p>
	</div>
{:else if $query.isLoading}
	<div class="mt-10 flex flex-col items-center justify-start">
		<LoadingSpinner variant="inline" size="md" text="Loading..." />
	</div>
{:else if $query.data}
	<div class="overflow-x-auto">
		<table class="min-w-full divide-y divide-gray-700">
			<thead class="bg-gray-800">
				<tr>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
					>
						Input Token
					</th>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
					>
						Output Token
					</th>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
					>
						Amount Traded
					</th>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
					>
						Timestamp
					</th>
					<th
						scope="col"
						class="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-300"
					>
						Transaction
					</th>
				</tr>
			</thead>
			<tbody class="divide-y divide-gray-800 bg-gray-900">
				{#each $sortedTrades as trade}
					<tr class="hover:bg-gray-800/50">
						<td class="whitespace-nowrap px-6 py-4 text-sm font-medium text-white">
							{trade.inputVaultBalanceChange.vault.token.symbol}
						</td>
						<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
							{trade.outputVaultBalanceChange.vault.token.symbol}
						</td>
						<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
							{formatUnits(BigInt(trade.inputVaultBalanceChange.amount), 18)}
						</td>
						<td class="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
							{formatTimestamp(trade.timestamp)}
						</td>
						<td class="whitespace-nowrap px-6 py-4 text-sm text-blue-400">
							<a
								href="{$currentNetwork.blockExplorer}/tx/{trade.tradeEvent.transaction.id}"
								target="_blank"
								rel="noopener noreferrer"
								class="hover:underline"
							>
								View Transaction
							</a>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if $query.hasNextPage}
			<div class="flex justify-center p-4">
				<Button
					on:click={() => $query.fetchNextPage()}
					disabled={$query.isFetchingNextPage}
					size="small"
				>
					{#if $query.isFetchingNextPage}
						<Spinner class="mr-3" size="4" />
					{/if}
					Load More
				</Button>
			</div>
		{/if}
	</div>
{/if}
