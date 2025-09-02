<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import type { CreateInfiniteQueryResult, InfiniteData } from '@tanstack/svelte-query';
	import type { SgVaultWithSubgraphName } from '@rainlanguage/orderbook';
	import { formatUnits } from 'viem';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import TableHead from '$lib/components/ui/table/TableHead.svelte';
	import TableRow from '$lib/components/ui/table/TableRow.svelte';
	import TableCell from '$lib/components/ui/table/TableCell.svelte';

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
			<thead>
				<TableRow isHeader>
					<TableHead align="center">Network</TableHead>
					<TableHead align="center">Vault ID</TableHead>
					<TableHead align="center">Orderbook</TableHead>
					<TableHead align="center">Owner</TableHead>
					<TableHead align="center">Token</TableHead>
					<TableHead align="center">Balance</TableHead>
					<TableHead align="center">Input For</TableHead>
					<TableHead align="center">Output For</TableHead>
				</TableRow>
			</thead>
			<tbody>
				{#each $query.data.pages as page}
					{#each page.vaults as { vault, subgraphName }}
						<TableRow className="border-b border-white/10 bg-gray-800/80 text-center text-gray-100 last:border-0">
							<TableCell className="text-gray-200">{subgraphName}</TableCell>
							<TableCell className="text-gray-200">0x{BigInt(vault.vaultId).toString(16).slice(0, 6)}...{BigInt(vault.vaultId).toString(16).slice(-4)}</TableCell>
							<TableCell className="text-gray-200">{vault.orderbook.id.toString().slice(0, 6)}...{vault.orderbook.id.toString().slice(-4)}</TableCell>
							<TableCell className="text-gray-200">{vault.owner.toString().slice(0, 6)}...{vault.owner.toString().slice(-4)}</TableCell>
							<TableCell className="text-gray-200">{vault.token.symbol}</TableCell>
							<TableCell className="text-gray-200">{formatUnits(BigInt(vault.balance), vault.token.decimals ? Number(vault.token.decimals) : 18)} {vault.token.symbol}</TableCell>
							<TableCell>
								{#each vault.ordersAsInput as order}
									<a
										class="text-blue-400 hover:text-blue-300"
										href={`https://v2.raindex.finance/orders/${$currentNetwork.id}-${vault.orderbook.id.toString()}-${order.orderHash.toString()}`}
										target="_blank"
									>
										{order.orderHash.toString().slice(0, 6)}...{order.orderHash.toString().slice(-4)}
									</a>
								{/each}
							</TableCell>
							<TableCell>
								{#each vault.ordersAsOutput as order}
									<a
										class="text-blue-400 hover:text-blue-300"
										href={`https://v2.raindex.finance/orders/${$currentNetwork.id}-${vault.orderbook.id.toString()}-${order.orderHash.toString()}`}
										target="_blank"
									>
										{order.orderHash.toString().slice(0, 6)}...{order.orderHash.toString().slice(-4)}
									</a>
								{/each}
							</TableCell>
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
