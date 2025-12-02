<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import { currentNetwork, sfts, vaultsQuery, oracleQuotes } from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { getAllTokensByNetwork } from '$lib/config/network';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	// Consolidated table usage
	import { containerStyles } from '$lib/styles/utils';
	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	type TokenRow = {
		id: string;
		address: string;
		name: string;
		symbol: string;
		price: number | null;
		totalHolders: string;
		totalSupply: string;
		totalTransfers: string;
		createdAt: string;
		isSft: boolean;
	};

	let processedTokens: TokenRow[] = [];
	let sftLookup = new Map<string, OffchainAssetReceiptVault>();
	let isVaultLoading = false;
	let vaultsError: string | null = null;
	let hasVaults = false;

	$: hasVaults = ($sfts?.length ?? 0) > 0;
	$: isVaultLoading = !hasVaults && ($vaultsQuery?.isPending || $vaultsQuery?.isFetching || false);
	$: vaultsError =
		!hasVaults && $vaultsQuery?.error instanceof Error
			? $vaultsQuery.error.message
			: !hasVaults && $vaultsQuery?.error
				? String($vaultsQuery.error)
				: null;
	$: sftLookup = new Map<string, OffchainAssetReceiptVault>(
		($sfts ?? []).map((vault: OffchainAssetReceiptVault) => [vault.id, vault])
	);

	function sumAmounts(entries?: Array<{ amount: string }>): bigint {
		return (entries ?? []).reduce((sum: bigint, entry) => sum + BigInt(entry.amount), 0n);
	}

	$: {
		if ($sfts && $sfts.length) {
			const rows: TokenRow[] = [];
			for (const sft of $sfts) {
				const lookupAddress = sft.address.toLowerCase();
				// Get oracle price for this token
				const oracleData = $oracleQuotes[lookupAddress];
				const price = oracleData?.price ?? null;

				rows.push({
					id: sft.id,
					address: sft.address,
					name: sft.name,
					symbol: sft.symbol,
					price,
					totalHolders: sft.tokenHolders
						.filter((holder: { balance: string }) => BigInt(holder.balance) > BigInt(0))
						.length.toString(),
					totalSupply: formatUnits(BigInt(sft.totalShares), 18),
					totalTransfers: sft.shareTransfers.length.toString(),
					createdAt: sft.deployTimestamp,
					isSft: true
				});
			}
			processedTokens = rows;
		} else {
			processedTokens = [];
		}
	}
</script>

{#if isVaultLoading}
	<div class="flex w-full items-center justify-center p-8">
		<LoadingSpinner
			variant="fullscreen"
			size="lg"
			text="Loading SFTs from {$currentNetwork?.displayName || 'network'}..."
		/>
	</div>
{:else if vaultsError}
	<div class="flex w-full items-center justify-center p-8 text-sm text-red-400">
		Failed to load SFTs: {vaultsError}
	</div>
{:else if hasVaults}
	<div>
		<PageContainer>
			<!-- Asset Table Section -->
			<Section>
				<div class="mb-4 sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Browse</h2>
				</div>
				<div class={'overflow-x-auto ' + containerStyles.cardBordered} data-tutorial="token-list">
					<Table>
						<thead>
							<tr class="border-b border-white/10">
								<th
									class="sticky left-0 z-10 bg-gray-800 px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Asset</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Price</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Market Cap</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Circulating Supply</th
								>
								<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
									>Holders</th
								>
								<th class="w-8"></th>
							</tr>
						</thead>
						<tbody>
							{#if !processedTokens.length}
								<tr>
									<td colspan="6" class="px-4 py-6 text-center text-sm text-gray-400">
										No assets available.
									</td>
								</tr>
							{:else}
								{#each processedTokens as token (token.id)}
									{@const sft = sftLookup.get(token.id)}
									{@const deposits = sumAmounts(sft?.deposits)}
									{@const withdraws = sumAmounts(sft?.withdraws)}
									{@const circulating = deposits - withdraws}
									{@const circulatingSupply = parseFloat(formatUnits(circulating, 18))}
									{@const displayPrice =
										typeof token.price === 'number' ? token.price : Number(token.price ?? NaN)}
									{@const marketCap =
										displayPrice != null && Number.isFinite(displayPrice)
											? circulatingSupply * displayPrice
											: null}
									<tr
										class="cursor-pointer transition-colors hover:bg-yellow-500/5"
										on:click={() => goto(`/trade/${token.id}`)}
									>
										<td class="sticky left-0 bg-gray-800 px-2 py-2 sm:px-4 sm:py-3">
											<TokenDisplay
												logoUrl={ALL_TOKENS.find(
													(s) => s.address.toLowerCase() === token.address.toLowerCase()
												)?.logoUrl}
												symbol={token.symbol}
												name={token.name}
											/>
										</td>
										<td class="px-2 py-2 sm:px-4 sm:py-3">
											<div class="font-medium">
												{Number.isFinite(displayPrice) ? `$${displayPrice.toFixed(2)}` : 'N/A'}
											</div>
										</td>
										<td class="px-2 py-2 sm:px-4 sm:py-3">
											<div class="text-sm">
												{#if marketCap != null}
													{marketCap >= 1_000_000
														? `$${(marketCap / 1_000_000).toFixed(2)}M`
														: marketCap >= 1_000
															? `$${(marketCap / 1_000).toFixed(1)}K`
															: `$${marketCap.toFixed(2)}`}
												{:else}
													N/A
												{/if}
											</div>
										</td>
										<td class="px-4 py-3">
											<div class="text-sm">
												{circulatingSupply >= 1000
													? `${(circulatingSupply / 1000).toFixed(2)}K`
													: circulatingSupply.toFixed(2)}
											</div>
										</td>
										<td class="px-2 py-2 sm:px-4 sm:py-3">
											<div class="text-sm">{token.totalHolders}</div>
										</td>
										<td class="px-2 py-2 sm:px-4 sm:py-3">
											<svg
												class="h-4 w-4 text-gray-400"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 5l7 7-7 7"
												/>
											</svg>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					</Table>
				</div>
			</Section>
		</PageContainer>

		<Footer />
	</div>
{:else}
	<div class="flex w-full items-center justify-center p-8">
		<EmptyState
			title="No SFTs Found"
			description="No SFTs available on {$currentNetwork?.displayName || 'this network'}."
		/>
	</div>
{/if}
