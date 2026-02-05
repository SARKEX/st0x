<script lang="ts">
	import { currentNetwork, sfts } from '$lib/stores';
	import { page } from '$app/stores';
	import { getAllTokensByNetwork, getTokenByAnyAddress } from '$lib/config/tokens';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { formatUnits } from 'viem';
	import { findQuoteForSymbol } from '$lib/utils/tradingViewSymbols';
	import { createPriceFeedsQuery } from '$lib/queries/priceFeeds';

	export let visible: boolean = false; // controlled by parent
	export let desktop: boolean = false; // is this the desktop sidebar?
	export let collapsed: boolean = false;

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	$: activePath = $page.url.pathname;

	type AssetWithMetrics = OffchainAssetReceiptVault & {
		price: number;
		dollarVolume: number;
	};
	let priceFeedsQuery = createPriceFeedsQuery($currentNetwork);
	$: priceFeedsQuery = createPriceFeedsQuery($currentNetwork);

	let sortedAssets: AssetWithMetrics[] = [];

	// Get all tokens for the current network
	$: ALL_TOKENS = $currentNetwork ? getAllTokensByNetwork($currentNetwork.chainId) : [];

	// Calculate assets sorted by volume
	$: sortedAssets = $sfts
		? [...$sfts]
				.map<AssetWithMetrics>((sft) => {
					// Calculate total on-chain volume (deposits + withdrawals)
					const depositVolume = sft.deposits.reduce(
						(sum: bigint, d: { amount: string }) => sum + BigInt(d.amount),
						BigInt(0)
					);
					const withdrawVolume = sft.withdraws.reduce(
						(sum: bigint, w: { amount: string }) => sum + BigInt(w.amount),
						BigInt(0)
					);
					const totalVolume = depositVolume + withdrawVolume;
					// Use token config symbol for price lookup so legacy symbols (e.g. tSTOX) resolve to the wrapped token's price feed (wtSTOX / AMEX:SPLG)
					const tokenInfo = getTokenByAnyAddress(sft.address);
					const symbolForPrice = tokenInfo?.symbol ?? sft.symbol;
					const quote = findQuoteForSymbol(
						symbolForPrice,
						$priceFeedsQuery?.data ?? [],
						ALL_TOKENS
					);
					const price = quote?.close ?? 0;
					const volumeInShares = parseFloat(formatUnits(totalVolume, 18));
					const dollarVolume = volumeInShares * price;
					return { ...sft, dollarVolume, price };
				})
				.sort((a, b) => b.dollarVolume - a.dollarVolume)
		: [];

	function toggleCollapse() {
		collapsed = !collapsed;
		dispatch('toggleCollapse', { collapsed });
	}
</script>

<!-- Pull-out tab (desktop) - always visible, positioned near top -->
{#if desktop}
	<button
		on:click={toggleCollapse}
		class="fixed top-16 z-[10001] rounded-r-lg border border-l-0 border-white/10 bg-gray-900/80 px-1 py-3 text-gray-400 backdrop-blur-xl transition-all duration-300 hover:bg-gray-800 hover:pr-2 hover:text-white"
		class:left-64={!collapsed}
		class:left-0={collapsed}
		aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
	>
		<svg
			class="h-4 w-4 transition-transform duration-300"
			class:rotate-180={collapsed}
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
		</svg>
	</button>
{/if}

<!-- Pull-out tab (mobile) - visible when sidebar is closed, highlighted for visibility -->
{#if !desktop && !visible}
	<button
		on:click={() => dispatch('open')}
		class="fixed left-0 top-1/3 z-[10001] flex items-center gap-1 rounded-r-lg border border-l-0 border-yellow-500/40 bg-gradient-to-r from-yellow-500/20 to-yellow-500/10 px-1.5 py-4 text-yellow-400 shadow-lg shadow-yellow-500/20 backdrop-blur-xl transition-all duration-300 hover:border-yellow-500/60 hover:bg-yellow-500/30 hover:pr-2.5 hover:text-yellow-300"
		aria-label="Open token list"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</button>
{/if}

<!-- Sidebar -->
<div
	class="fixed left-0 top-0 z-[10000] flex h-full transform flex-col border-r border-white/5 bg-gray-900/70 backdrop-blur-xl transition-all duration-300 ease-in-out"
	class:w-64={desktop || (!desktop && visible)}
	class:w-0={!desktop && !visible}
	class:max-w-[80vw]={!desktop && visible}
	class:-translate-x-full={(desktop && collapsed) || (!desktop && !visible)}
	class:pointer-events-none={(desktop && collapsed) || (!desktop && !visible)}
>
	<!-- Mobile header with close button -->
	{#if !desktop}
		<div class="flex items-center justify-end border-b border-white/5 p-2">
			<button
				on:click={() => dispatch(visible ? 'close' : 'open')}
				class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
				aria-label={visible ? 'Close sidebar' : 'Open sidebar'}
			>
				<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>
	{:else}
		<!-- Desktop: add some top padding to align with header -->
		<div class="h-14"></div>
	{/if}

	{#if (desktop && !collapsed) || (!desktop && visible)}
		<!-- Assets List (scrollable) -->
		<div class="flex-1 overflow-y-auto p-3">
			<div class="mb-3 px-2 text-[10px] font-medium uppercase tracking-wider text-gray-600">
				Assets
			</div>
			<div class="space-y-0.5">
				{#each sortedAssets as asset}
					{@const tokenInfo = getTokenByAnyAddress(asset.address)}
					<a
						href={`/trade/${tokenInfo?.address ?? asset.id}`}
						on:click={() => {
							if (!desktop) dispatch('close');
						}}
						class="block rounded-md px-2 py-2 transition-colors hover:bg-white/5 {activePath ===
						`/trade/${tokenInfo?.address ?? asset.id}`
							? 'border-l-2 border-yellow-500 bg-yellow-500/10'
							: ''}"
					>
						<div class="flex items-center justify-between gap-2">
							<div class="flex min-w-0 flex-1 items-center gap-2">
								{#if tokenInfo?.logoUrl}
									<img
										src={tokenInfo.logoUrl}
										alt={asset.symbol}
										class="h-6 w-6 shrink-0 rounded-full"
									/>
								{:else}
									<div
										class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold"
									>
										{asset.symbol.charAt(0)}
									</div>
								{/if}
								<div class="min-w-0 flex-1">
									<div class="truncate text-sm font-medium text-white">{asset.symbol}</div>
									<div class="truncate text-xs text-gray-400">{asset.name}</div>
								</div>
							</div>
							<div class="text-sm font-medium text-white">
								${asset.price > 0 ? asset.price.toFixed(2) : 'N/A'}
							</div>
						</div>
					</a>
				{/each}
				{#if sortedAssets.length === 0}
					<div class="py-8 text-center text-sm text-gray-400">No assets available</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
