<script lang="ts">
	import { currentNetwork, sfts } from '$lib/stores';
	import { page } from '$app/stores';
	import { createApiTokensQuery, findApiTokenByAnyAddress } from '$lib/queries/tokens';
	import type { OffchainAssetReceiptVault } from '$lib/types/OffchainAssetReceiptVault';
	import { formatUnits } from 'viem';
	import { createMidpointPricesQuery, getMidpointPrice } from '$lib/queries/midpointPrices';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { assetLists, partitionByLists } from '$lib/stores/assetListsStore';

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
	// Displayed price is the bid/ask midpoint from the public prices endpoint (falls back to
	// the last known price when a book is one-sided, else 0 → N/A). Matches sft.address to the
	// canonical token so wrapped/legacy variants resolve.
	let midpointPricesQuery = createMidpointPricesQuery($currentNetwork);
	$: midpointPricesQuery = createMidpointPricesQuery($currentNetwork);

	let sortedAssets: AssetWithMetrics[] = [];

	$: apiTokensQuery = createApiTokensQuery($currentNetwork?.chainId);
	$: apiTokens = $apiTokensQuery.data ?? [];

	// Calculate assets sorted by volume
	$: sortedAssets = $sfts
		? [...$sfts]
				.map<AssetWithMetrics>((sft) => {
					const totalVolume = BigInt(sft.activityVolume ?? '0');
					const price = getMidpointPrice($midpointPricesQuery?.data, sft.address)?.price ?? 0;
					const volumeInShares = parseFloat(formatUnits(totalVolume, 18));
					const dollarVolume = volumeInShares * price;
					return { ...sft, dollarVolume, price };
				})
				.sort((a, b) => b.dollarVolume - a.dollarVolume)
		: [];

	function assetListKey(asset: AssetWithMetrics): string {
		const tokenInfo = findApiTokenByAnyAddress(apiTokens, asset.address);
		return (tokenInfo?.address ?? asset.address ?? asset.id).toLowerCase();
	}

	$: sections = partitionByLists(
		sortedAssets,
		assetListKey,
		$assetLists.favorites,
		$assetLists.watchlist
	);

	function toggleCollapse() {
		collapsed = !collapsed;
		dispatch('toggleCollapse', { collapsed });
	}

	function onToggleFavorite(event: MouseEvent, address: string) {
		event.preventDefault();
		event.stopPropagation();
		assetLists.toggleFavorite(address);
	}

	function onToggleWatch(event: MouseEvent, address: string) {
		event.preventDefault();
		event.stopPropagation();
		assetLists.toggleWatch(address);
	}
</script>

<!-- Pull-out tab (desktop) - always visible, positioned near top -->
{#if desktop}
	<button
		on:click={toggleCollapse}
		class="bg-surface-1/80 fixed top-16 z-[10001] rounded-r-lg border border-l-0 border-line px-1 py-3 text-text-3 backdrop-blur-xl transition-all duration-300 hover:bg-surface-2 hover:pr-2 hover:text-text"
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
		class="fixed left-0 top-1/3 z-[10001] flex items-center gap-1 rounded-r-lg border border-l-0 border-accent-line bg-accent-soft px-1.5 py-4 text-accent shadow-lg shadow-[var(--shadow-accent)] backdrop-blur-xl transition-all duration-300 hover:pr-2.5 hover:brightness-110"
		aria-label="Open token list"
	>
		<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</button>
{/if}

<!-- Sidebar -->
<div
	class="bg-surface-1/70 fixed left-0 top-0 z-[10000] flex h-full transform flex-col border-r border-line backdrop-blur-xl transition-all duration-300 ease-in-out"
	class:w-64={desktop || (!desktop && visible)}
	class:w-0={!desktop && !visible}
	class:max-w-[80vw]={!desktop && visible}
	class:-translate-x-full={(desktop && collapsed) || (!desktop && !visible)}
	class:pointer-events-none={(desktop && collapsed) || (!desktop && !visible)}
>
	<!-- Mobile header with close button -->
	{#if !desktop}
		<div class="flex items-center justify-end border-b border-line p-2">
			<button
				on:click={() => dispatch(visible ? 'close' : 'open')}
				class="rounded-lg p-2 text-text-3 transition-colors hover:bg-surface-2 hover:text-text"
				aria-label={visible ? 'Close sidebar' : 'Open sidebar'}
			>
				<Icon name="close" className="h-5 w-5" />
			</button>
		</div>
	{:else}
		<!-- Desktop: add some top padding to align with header -->
		<div class="h-14"></div>
	{/if}

	{#if (desktop && !collapsed) || (!desktop && visible)}
		<!-- Assets List (scrollable) -->
		<div class="flex-1 overflow-y-auto p-3">
			{#each [{ id: 'favorites', label: 'Favorites', items: sections.favorites }, { id: 'watchlist', label: 'Watchlist', items: sections.watchlist }, { id: 'all', label: 'Assets', items: sections.rest }] as section}
				{#if section.items.length > 0 || (section.id === 'all' && sortedAssets.length === 0)}
					<div class="mb-3 px-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
						{section.label}
					</div>
					<div class="mb-4 space-y-0.5">
						{#each section.items as asset}
							{@const tokenInfo = findApiTokenByAnyAddress(apiTokens, asset.address)}
							{@const listKey = assetListKey(asset)}
							{@const isFav = assetLists.isFavorite($assetLists, listKey)}
							{@const isWatched = assetLists.isWatched($assetLists, listKey)}
							<a
								href={`/trade/${tokenInfo?.address ?? asset.id}`}
								on:click={() => {
									if (!desktop) dispatch('close');
								}}
								class="block rounded-md px-2 py-2 transition-colors hover:bg-surface-2 {activePath ===
								`/trade/${tokenInfo?.address ?? asset.id}`
									? 'border-l-2 border-accent bg-accent-soft'
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
												class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-bold"
											>
												{asset.symbol.charAt(0)}
											</div>
										{/if}
										<div class="min-w-0 flex-1">
											<div class="truncate text-sm font-medium text-text">{asset.symbol}</div>
											<div class="truncate text-xs text-text-3">{asset.name}</div>
										</div>
									</div>
									<div class="flex shrink-0 items-center gap-0.5">
										<button
											type="button"
											class="rounded p-1 transition-colors {isFav
												? 'text-accent'
												: 'text-text-muted hover:text-text-2'}"
											aria-label={isFav ? `Unfavorite ${asset.symbol}` : `Favorite ${asset.symbol}`}
											aria-pressed={isFav}
											on:click={(event) => onToggleFavorite(event, listKey)}
										>
											<Icon
												name="star"
												className="h-3.5 w-3.5"
												fill={isFav ? 'currentColor' : 'none'}
											/>
										</button>
										<button
											type="button"
											class="rounded p-1 transition-colors {isWatched
												? 'text-accent'
												: 'text-text-muted hover:text-text-2'}"
											aria-label={isWatched ? `Unwatch ${asset.symbol}` : `Watch ${asset.symbol}`}
											aria-pressed={isWatched}
											on:click={(event) => onToggleWatch(event, listKey)}
										>
											<Icon name="eye" className="h-3.5 w-3.5" />
										</button>
										<div class="min-w-[3.25rem] text-right text-sm font-medium text-text">
											${asset.price > 0 ? asset.price.toFixed(2) : 'N/A'}
										</div>
									</div>
								</div>
							</a>
						{/each}
						{#if section.id === 'all' && sortedAssets.length === 0}
							<div class="py-8 text-center text-sm text-text-3">No assets available</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>
