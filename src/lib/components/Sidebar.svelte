<script lang="ts">
	import { currentNetwork, sfts } from '$lib/stores';
	import { signerAddress, connected } from 'svelte-wagmi';
	import { page } from '$app/stores';
	import ExternalLinkIcon from '$lib/components/icons/IconExternalLink.svelte';
	import ShareButton from './ShareButton.svelte';
	import { getAllTokensByNetwork } from '$lib/config/network';
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

	let searchTerm = '';
	type AssetWithMetrics = OffchainAssetReceiptVault & {
		price: number;
		dollarVolume: number;
	};
	let priceFeedsQuery = createPriceFeedsQuery($currentNetwork);
	$: priceFeedsQuery = createPriceFeedsQuery($currentNetwork);

	let filteredAssets: AssetWithMetrics[] = [];
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
					const quote = findQuoteForSymbol(sft.symbol, $priceFeedsQuery?.data ?? [], ALL_TOKENS);
					const price = quote?.close ?? 0;
					const volumeInShares = parseFloat(formatUnits(totalVolume, 18));
					const dollarVolume = volumeInShares * price;
					return { ...sft, dollarVolume, price };
				})
				.sort((a, b) => b.dollarVolume - a.dollarVolume)
		: [];

	// Filter assets based on search
	$: if (searchTerm.trim().length >= 2) {
		const trimmed = searchTerm.trim().toLowerCase();
		filteredAssets = sortedAssets.filter(
			(asset) =>
				asset.name.toLowerCase().includes(trimmed) || asset.symbol.toLowerCase().includes(trimmed)
		);
	} else {
		filteredAssets = sortedAssets;
	}

	function toggleCollapse() {
		collapsed = !collapsed;
		dispatch('toggleCollapse', { collapsed });
	}
</script>

<!-- Sidebar -->
<div
	class="fixed left-0 top-0 z-[10000] flex h-full transform flex-col border-b border-r border-white/10 bg-gray-800/95 backdrop-blur-lg transition-all duration-300 ease-in-out"
	class:w-64={desktop || (!desktop && visible)}
	class:w-0={!desktop && !visible}
	class:max-w-[80vw]={!desktop && visible}
	class:-translate-x-full={(desktop && collapsed) || (!desktop && !visible)}
	class:pointer-events-none={(desktop && collapsed) || (!desktop && !visible)}
>
	<!-- Header with collapse button (desktop) or arrow indicator (mobile/tablet) -->
	<div class="flex items-center justify-end border-b border-white/10 p-2">
		{#if desktop}
			<button
				on:click={toggleCollapse}
				class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
				aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			>
				<svg
					class="h-5 w-5 transition-transform duration-300"
					class:rotate-180={!collapsed}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		{:else}
			<button
				on:click={() => dispatch(visible ? 'close' : 'open')}
				class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
				aria-label={visible ? 'Collapse sidebar' : 'Expand sidebar'}
			>
				<svg
					class="h-5 w-5 transition-transform duration-300"
					class:rotate-180={visible}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
				</svg>
			</button>
		{/if}
	</div>

	{#if (desktop && !collapsed) || (!desktop && visible)}
		<!-- Search Bar -->
		<div class="border-b border-white/10 p-3">
			<div class="relative">
				<input
					type="text"
					bind:value={searchTerm}
					placeholder="Search assets..."
					class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm placeholder-gray-400 outline-none focus:border-yellow-500/50"
				/>
				{#if searchTerm}
					<button
						on:click={() => (searchTerm = '')}
						class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
					>
						<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M6 18L18 6M6 6l12 12"
							/>
						</svg>
					</button>
				{/if}
			</div>
		</div>

		<!-- Assets List (scrollable) -->
		<div class="flex-1 overflow-y-auto p-3">
			<div class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
				Assets by Volume
			</div>
			<div class="space-y-1">
				{#each filteredAssets as asset}
					{@const tokenInfo = ALL_TOKENS.find(
						(t) => t.address.toLowerCase() === asset.address.toLowerCase()
					)}
					<a
						href={`/trade/${asset.id}`}
						on:click={() => {
							if (!desktop) dispatch('close');
						}}
						class="block rounded-lg px-2 py-2 transition-colors hover:bg-white/5 {activePath ===
						`/trade/${asset.id}`
							? 'bg-yellow-500/20'
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
							<div class="text-right">
								<div class="text-sm font-medium text-white">
									${asset.price > 0 ? asset.price.toFixed(2) : 'N/A'}
								</div>
								<div class="text-xs text-gray-400">
									{#if asset.dollarVolume >= 1000000}
										${(asset.dollarVolume / 1000000).toFixed(2)}M
									{:else if asset.dollarVolume >= 1000}
										${(asset.dollarVolume / 1000).toFixed(1)}K
									{:else}
										${asset.dollarVolume.toFixed(2)}
									{/if}
								</div>
							</div>
						</div>
					</a>
				{/each}
				{#if filteredAssets.length === 0}
					<div class="py-8 text-center text-sm text-gray-400">
						{searchTerm ? 'No assets found' : 'No assets available'}
					</div>
				{/if}
			</div>
		</div>

		<!-- Bottom Info -->
		<div class="border-t border-white/10 bg-gray-800/95 p-3">
			<div class="flex w-full flex-col gap-2">
				<div class="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2">
					<div class="flex w-full flex-col">
						<div class="text-xs font-semibold text-yellow-500">{$currentNetwork.name}</div>
						{#if $connected}
							<div class="text-xs text-gray-400">
								{$signerAddress?.slice(0, 6)}...{$signerAddress?.slice(-4)}
							</div>
						{:else}
							<div class="text-xs text-gray-400">Not Connected</div>
						{/if}
					</div>
				</div>
				<a
					href="/docs"
					class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-normal text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
				>
					<ExternalLinkIcon class="h-4 w-4" />
					<span>Docs</span>
				</a>
				<ShareButton />
			</div>
		</div>
	{/if}
</div>
