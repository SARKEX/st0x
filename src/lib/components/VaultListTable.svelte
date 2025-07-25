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
	import { currentNetwork } from '$lib/stores';
	import type { CreateInfiniteQueryResult, InfiniteData } from '@tanstack/svelte-query';
	import type { SgVaultWithSubgraphName } from '@rainlanguage/orderbook';
	import { formatUnits } from 'viem';
	import LoadingSpinner from './LoadingSpinner.svelte';

	export let query: CreateInfiniteQueryResult<
		InfiniteData<{ vaults: SgVaultWithSubgraphName[] }, unknown>,
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
				<TableHeadCell class="text-gray-200">Vault ID</TableHeadCell>
				<TableHeadCell class="text-gray-200">Orderbook</TableHeadCell>
				<TableHeadCell class="text-gray-200">Owner</TableHeadCell>
				<TableHeadCell class="text-gray-200">Token</TableHeadCell>
				<TableHeadCell class="text-gray-200">Balance</TableHeadCell>
				<TableHeadCell class="text-gray-200">Input For</TableHeadCell>
				<TableHeadCell class="text-gray-200">Output For</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each $query.data.pages as page}
					{#each page.vaults as { vault, subgraphName }}
						<TableBodyRow
							class="border-b border-white/10 bg-gray-800/80 text-center text-gray-100 last:border-0"
						>
							<TableBodyCell class="text-gray-200">{subgraphName}</TableBodyCell>
							<TableBodyCell class="text-gray-200"
								>0x{BigInt(vault.vaultId).toString(16).slice(0, 6)}...{BigInt(vault.vaultId)
									.toString(16)
									.slice(-4)}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{vault.orderbook.id.toString().slice(0, 6)}...{vault.orderbook.id
									.toString()
									.slice(-4)}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200"
								>{vault.owner.toString().slice(0, 6)}...{vault.owner
									.toString()
									.slice(-4)}</TableBodyCell
							>
							<TableBodyCell class="text-gray-200">{vault.token.symbol}</TableBodyCell>
							<TableBodyCell class="text-gray-200"
								>{formatUnits(
									BigInt(vault.balance),
									vault.token.decimals ? Number(vault.token.decimals) : 18
								)}
								{vault.token.symbol}</TableBodyCell
							>
							<TableBodyCell>
								{#each vault.ordersAsInput as order}
									<a
										class="text-blue-400 hover:text-blue-300"
										href={`https://v2.raindex.finance/orders/${
											$currentNetwork.id
										}-${vault.orderbook.id.toString()}-${order.orderHash.toString()}`}
										target="_blank"
									>
										{order.orderHash.toString().slice(0, 6)}...{order.orderHash
											.toString()
											.slice(-4)}
									</a>
								{/each}
							</TableBodyCell>
							<TableBodyCell>
								{#each vault.ordersAsOutput as order}
									<a
										class="text-blue-400 hover:text-blue-300"
										href={`https://v2.raindex.finance/orders/${
											$currentNetwork.id
										}-${vault.orderbook.id.toString()}-${order.orderHash.toString()}`}
										target="_blank"
									>
										{order.orderHash.toString().slice(0, 6)}...{order.orderHash
											.toString()
											.slice(-4)}
									</a>
								{/each}
							</TableBodyCell>
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
