<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import {
		currentNetwork,
		sfts,
		tokenGlobalQuote,
		orderbookQuotes,
		orderbookQuotesResource,
		vaultSnapshotResource
	} from '$lib/stores';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import Section from '$lib/components/ui/Section.svelte';
	import ListCard from '$lib/components/ui/ListCard.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import TokenDisplay from '$lib/components/ui/TokenDisplay.svelte';
	import { getAllTokensByNetwork } from '$lib/network';
	import { formatUnits } from 'viem';
	import { goto } from '$app/navigation';
	import PageContainer from '$lib/components/ui/PageContainer.svelte';
	import Table from '$lib/components/ui/table/Table.svelte';
	// Consolidated table usage
	import { containerStyles } from '$lib/utils/styles';
	import { onMount } from 'svelte';
	import type { TokenPriceSummary } from '$lib/domain/onchainOrders';
	import { findQuoteForSymbol } from '$lib/utils/tradingViewSymbols';

	let st0xVaults: OffchainAssetReceiptVault[] = [];

	// Filter tokens by current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	let searchTerm = '';
	let filteredSfts: OffchainAssetReceiptVault[] = [];

	type TokenRow = {
		id: string;
		address: string;
		name: string;
		symbol: string;
		price: number | null;
		onChainPrice: number | null;
		bidPrice: number | null;
		askPrice: number | null;
		totalHolders: string;
		totalSupply: string;
		totalTransfers: string;
		createdAt: string;
		isSft: boolean;
	};

	let processedTokens: TokenRow[] = [];

	$: vaultStatus = $vaultSnapshotResource?.status ?? 'idle';
	$: isVaultLoading =
		(!$sfts || !$sfts.length) && (vaultStatus === 'idle' || vaultStatus === 'loading');
	$: quotesRecord = $orderbookQuotes ?? {};
	$: quotesStatus = $orderbookQuotesResource?.status ?? 'idle';
	$: quotesHaveData = Object.keys(quotesRecord).length > 0;
	$: quotesLoading = quotesStatus === 'loading' && !quotesHaveData;
	$: quotesError =
		$orderbookQuotesResource?.status === 'error' ? $orderbookQuotesResource.error : null;


	$: {
		const trimmedSearch = searchTerm.trim();
		if (trimmedSearch.length >= 3) {
			filteredSfts = $sfts.filter(
				(s) =>
					s.name.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
					s.symbol.toLowerCase().includes(trimmedSearch.toLowerCase())
			);
		} else {
			filteredSfts = [];
		}
	}

	$: if ($sfts && $tokenGlobalQuote) {
		st0xVaults = $sfts;
	}

	function calculateMidPrice(summary?: TokenPriceSummary | null): number | null {
		if (!summary) return null;
		const { bid, ask } = summary;
		if (bid != null && ask != null) {
			return (bid + ask) / 2;
		}
		return bid ?? ask ?? null;
	}

	$: {
		if ($sfts && $sfts.length) {
			const rows: TokenRow[] = [];
			for (const sft of $sfts) {
				const quote = findQuoteForSymbol(sft.symbol, $tokenGlobalQuote, ALL_TOKENS);
				const lookupAddress = sft.address.toLowerCase();
				const summary = quotesRecord[lookupAddress] ?? null;
				const bidPrice = summary?.bid ?? null;
				const askPrice = summary?.ask ?? null;
				const onChainPrice = calculateMidPrice(summary);
				const fallbackPrice = quote?.close ?? null;
				const price = onChainPrice ?? fallbackPrice ?? null;

				rows.push({
					id: sft.id,
					address: sft.address,
					name: sft.name,
					symbol: sft.symbol,
					price,
					onChainPrice,
					bidPrice,
					askPrice,
					totalHolders: sft.tokenHolders
						.filter((holder) => BigInt(holder.balance) > BigInt(0))
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
{:else if $sfts.length > 0}
	<div>
		<PageContainer>
			<!-- Asset Table Section -->
			<Section>
				<div class="mb-4 sm:mb-6">
					<h2 class="text-base font-semibold sm:text-lg lg:text-xl">Browse</h2>
				</div>
				{#if quotesLoading}
					<div class="flex w-full justify-center py-12">
						<LoadingSpinner size="lg" text="Fetching on-chain prices..." />
					</div>
				{:else}
					{#if quotesError}
						<div
							class="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200"
						>
							Unable to refresh on-chain quotes right now. Displayed prices may be stale.
						</div>
					{/if}
					<div class={'overflow-x-auto ' + containerStyles.cardBordered}>
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
										>On-Chain Price</th
									>
									<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
										>On-Chain Market Cap</th
									>
									<th class="px-2 py-2 text-left text-xs font-medium text-gray-400 sm:px-4 sm:py-3"
										>On-Chain Supply</th
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
										<td colspan="7" class="px-4 py-6 text-center text-sm text-gray-400">
											No assets available.
										</td>
									</tr>
								{:else}
									{#each processedTokens as token (token.id)}
										{@const sft = $sfts.find((s) => s.id === token.id)}
										{@const deposits = sft
											? sft.deposits.reduce((sum, d) => sum + BigInt(d.amount), BigInt(0))
											: BigInt(0)}
										{@const withdraws = sft
											? sft.withdraws.reduce((sum, w) => sum + BigInt(w.amount), BigInt(0))
											: BigInt(0)}
										{@const circulating = deposits - withdraws}
										{@const circulatingSupply = parseFloat(formatUnits(circulating, 18))}
										{@const displayPrice =
											typeof token.price === 'number' ? token.price : Number(token.price ?? NaN)}
										{@const onChainPrice = token.onChainPrice ?? null}
										{@const onChainMarketCap =
											onChainPrice != null ? circulatingSupply * onChainPrice : null}
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
												<div class="text-sm text-gray-200">
													{onChainPrice != null ? `$${onChainPrice.toFixed(2)}` : 'N/A'}
												</div>
											</td>
											<td class="px-2 py-2 sm:px-4 sm:py-3">
												<div class="text-sm">
													{#if onChainMarketCap != null}
														{onChainMarketCap >= 1_000_000
															? `$${(onChainMarketCap / 1_000_000).toFixed(2)}M`
															: onChainMarketCap >= 1_000
																? `$${(onChainMarketCap / 1_000).toFixed(1)}K`
																: `$${onChainMarketCap.toFixed(2)}`}
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
				{/if}
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
