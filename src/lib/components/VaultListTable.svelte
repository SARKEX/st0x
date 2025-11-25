<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import type { CreateInfiniteQueryResult, InfiniteData } from '@tanstack/svelte-query';
	import { ArrowUpFromBracketOutline } from 'flowbite-svelte-icons';
	import type { SgVault, RaindexVault } from '@rainlanguage/orderbook';
	import { formatUnits } from 'viem';
	import LoadingSpinner from './LoadingSpinner.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import { tableStyles } from '$lib/styles/table';
	import { getRaindexOrderUrl } from '$lib/utils/tokenMath';
	// Consolidated table: use native thead/tr/th/td

	export let query: CreateInfiniteQueryResult<
		InfiniteData<
			{
				vaults: { vault: SgVault; raindexVault: RaindexVault; subgraphName: string }[];
				hasMore: boolean;
			},
			unknown
		>,
		Error
	>;
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import { containerStyles } from '$lib/styles/utils';
	import transactionStore from '$lib/stores/transaction';

	async function withdraw(vault: RaindexVault) {
		transactionStore.handleWithdraw(vault);
	}
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
		<Table class={tableStyles.container}>
			<thead>
				<tr class="border-b border-white/10">
					<th class={tableStyles.headerCell}>Network</th>
					<th class={tableStyles.headerCell}>Vault ID</th>
					<th class={tableStyles.headerCell}>Orderbook</th>
					<th class={tableStyles.headerCell}>Owner</th>
					<th class={tableStyles.headerCell}>Token</th>
					<th class={tableStyles.headerCell}>Balance</th>
					<th class={tableStyles.headerCell}>Input For</th>
					<th class={tableStyles.headerCell}>Output For</th>
					<th class={tableStyles.headerCell}>Withdraw</th>
				</tr>
			</thead>
			<tbody>
				{#each $query.data.pages as page}
					{#each page.vaults as { vault, raindexVault, subgraphName }}
						<tr class={tableStyles.row}>
							<td class={tableStyles.cell}>{subgraphName}</td>
							<td class={tableStyles.cell}>
								<!-- Mobile: last 6 only -->
								<span class="sm:hidden">…{BigInt(vault.vaultId).toString(16).slice(-6)}</span>
								<!-- Desktop: 6...4 -->
								<span class="hidden sm:inline"
									>0x{BigInt(vault.vaultId).toString(16).slice(0, 6)}...{BigInt(vault.vaultId)
										.toString(16)
										.slice(-4)}</span
								>
							</td>
							<td class={tableStyles.cell}>
								<span class="sm:hidden">…{vault.orderbook.id.toString().slice(-6)}</span>
								<span class="hidden sm:inline"
									>{vault.orderbook.id.toString().slice(0, 6)}...{vault.orderbook.id
										.toString()
										.slice(-4)}</span
								>
							</td>
							<td class={tableStyles.cell}>
								<span class="sm:hidden">…{vault.owner.toString().slice(-6)}</span>
								<span class="hidden sm:inline"
									>{vault.owner.toString().slice(0, 6)}...{vault.owner.toString().slice(-4)}</span
								>
							</td>
							<td class={tableStyles.cell}>{vault.token.symbol}</td>
							<td class="p-2 text-xs text-gray-200 sm:p-3 sm:text-sm"
								>{formatUnits(
									BigInt(vault.balance),
									vault.token.decimals ? Number(vault.token.decimals) : 18
								)}
								{vault.token.symbol}</td
							>
							<td class={tableStyles.cell}>
								{#each vault.ordersAsInput as order}
									<!-- Mobile: last 6 only -->
									<div class="sm:hidden">
										<ExternalLink
											href={getRaindexOrderUrl(
												$currentNetwork.id,
												vault.orderbook.id.toString(),
												order.orderHash.toString()
											)}
											label={order.orderHash.toString()}
											truncate={{ start: 0, end: 6 }}
											className="text-blue-400 hover:text-blue-300"
										/>
									</div>
									<!-- Desktop: 6...4 -->
									<div class="hidden sm:block">
										<ExternalLink
											href={getRaindexOrderUrl(
												$currentNetwork.id,
												vault.orderbook.id.toString(),
												order.orderHash.toString()
											)}
											label={order.orderHash.toString()}
											truncate={{ start: 6, end: 4 }}
											className="text-blue-400 hover:text-blue-300"
										/>
									</div>
								{/each}
							</td>
							<td class={tableStyles.cell}>
								{#each vault.ordersAsOutput as order}
									<!-- Mobile: last 6 only -->
									<div class="sm:hidden">
										<ExternalLink
											href={getRaindexOrderUrl(
												$currentNetwork.id,
												vault.orderbook.id.toString(),
												order.orderHash.toString()
											)}
											label={order.orderHash.toString()}
											truncate={{ start: 0, end: 6 }}
											className="text-blue-400 hover:text-blue-300"
										/>
									</div>
									<!-- Desktop: 6...4 -->
									<div class="hidden sm:block">
										<ExternalLink
											href={getRaindexOrderUrl(
												$currentNetwork.id,
												vault.orderbook.id.toString(),
												order.orderHash.toString()
											)}
											label={order.orderHash.toString()}
											truncate={{ start: 6, end: 4 }}
											className="text-blue-400 hover:text-blue-300"
										/>
									</div>
								{/each}
							</td>
							<td class="p-2 text-center text-xs sm:p-3 sm:text-sm">
								<button
									on:click={() => withdraw(raindexVault)}
									class="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
									title="Withdraw"
								>
									<ArrowUpFromBracketOutline class="h-4 w-4" />
								</button>
							</td>
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
