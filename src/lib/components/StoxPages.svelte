<script lang="ts">
	import { STOXs, ETFs, ST0NX, USDC_TOKEN } from '$lib/network';
	import { goto } from '$app/navigation';
	import { orderTokenStore, tokenGlobalQuote } from '$lib/stores';
	import type { Token } from 'sushi/currency';
	import type { ApiStockQuote } from '$lib/types';

	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';

	const CARDS_PER_PAGE = 8;
	let currentPage = 0;

	const FILTERS = ['All', 'ST0x', 'ETFs', 'ST0NX'];
	let activeFilter = 'All';

	// Treat all tokens as Token[] for display
	$: allTokens = ([] as Token[]).concat(STOXs as Token[], ETFs as Token[], ST0NX as Token[]);
	$: filteredTokens =
		activeFilter === 'All'
			? allTokens
			: activeFilter === 'ST0x'
			? (STOXs as Token[])
			: activeFilter === 'ETFs'
			? (ETFs as Token[])
			: (ST0NX as Token[]);

	// Calculate total pages
	$: totalPages = Math.ceil(filteredTokens.length / CARDS_PER_PAGE);

	// Get the tokens for the current page
	$: paginatedTokens = filteredTokens.slice(
		currentPage * CARDS_PER_PAGE,
		(currentPage + 1) * CARDS_PER_PAGE
	);

	// Helper function to get token data
	function getTokenData(symbol: string) {
		if (!$tokenGlobalQuote || $tokenGlobalQuote.length === 0) return null;

		const quote = ($tokenGlobalQuote as unknown as ApiStockQuote[])?.find(
			(q) => q?.['Global Quote']?.['01. symbol'] === symbol?.split('s1')[0]
		);

		if (!quote || !quote['Global Quote']) return null;

		const globalQuote = quote['Global Quote'];

		// Check if essential data is present
		if (
			globalQuote['05. price'] == null ||
			globalQuote['09. change'] == null ||
			globalQuote['10. change percent'] == null
		) {
			return null;
		}

		const price = parseFloat(globalQuote['05. price']);
		const change = parseFloat(globalQuote['09. change']);
		const changePercent = parseFloat(globalQuote['10. change percent'].replace('%', ''));

		// Check for parsing errors
		if (isNaN(price) || isNaN(change) || isNaN(changePercent)) {
			return null;
		}

		return { price, change, changePercent };
	}

	function nextPage() {
		if (currentPage < totalPages - 1) currentPage += 1;
	}
	function prevPage() {
		if (currentPage > 0) currentPage -= 1;
	}

	function handleStoxClick(stox: Token) {
		// Set the token data in the store
		orderTokenStore.set({
			inputToken: stox,
			outputToken: USDC_TOKEN,
			orderType: 'Buy'
		});

		// Navigate to the neworder page
		goto('/neworder');
	}

	function handleFilterChange(filter: string) {
		activeFilter = filter;
		currentPage = 0;
	}
</script>

<div class={SECTION_CLASSES}>
	<div class="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
		<!-- Filter Tabs -->
		<div class="flex gap-2">
			{#each FILTERS as filter}
				<button
					on:click={() => handleFilterChange(filter)}
					class="px-4 py-1.5 rounded-md text-xs font-semibold transition-colors
						{activeFilter === filter ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}"
				>
					{filter}
				</button>
			{/each}
		</div>
		<div class="flex items-center gap-2">
			<button
				class="rounded bg-gray-700 p-2 disabled:opacity-50"
				on:click={prevPage}
				disabled={currentPage === 0}
				aria-label="Previous"
			>
				←
			</button>
			<button
				class="rounded bg-gray-700 p-2 disabled:opacity-50"
				on:click={nextPage}
				disabled={currentPage === totalPages - 1}
				aria-label="Next"
			>
				→
			</button>
		</div>
	</div>
	{#key currentPage}
		<div class="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
			{#each paginatedTokens as stox}
				{@const tokenData = getTokenData(stox.symbol ?? '')}
				<button
					type="button"
					class="relative flex w-full cursor-pointer flex-col rounded-2xl border border-white/10 bg-gray-800/80 p-3 text-left transition-all duration-200 hover:border-yellow-500/30 hover:bg-gray-700/80 sm:p-5"
					on:click={() => handleStoxClick(stox)}
				>
					<div class="flex flex-col gap-2 sm:gap-3">
						<div class="flex items-center gap-2 sm:gap-3">
							<img
								src={stox.logoUrl}
								alt={stox.symbol}
								class="h-8 w-8 rounded-full bg-gray-700 sm:h-10 sm:w-10"
							/>
							<div class="min-w-0 flex-1">
								<div class="truncate text-sm font-semibold text-white sm:text-base">
									{stox.name}
								</div>
								<div class="text-xs text-gray-400">{stox.symbol}</div>
							</div>
						</div>
						<div class="flex items-center justify-between border-t border-white/5 pt-2 sm:pt-3">
							<div class="text-xs text-gray-400 sm:text-sm">Price</div>
							<div class="text-xs font-medium text-white sm:text-sm">
								{#if tokenData}
									${tokenData.price.toFixed(2)}
								{:else}
									<div class="h-3 w-12 animate-pulse rounded bg-gray-600 sm:h-4 sm:w-16"></div>
								{/if}
							</div>
						</div>
						<div class="flex items-center justify-between">
							<div class="text-xs text-gray-400 sm:text-sm">24h Change</div>
							<div
								class="text-xs font-medium sm:text-sm"
								class:text-green-500={tokenData ? tokenData.change >= 0 : true}
								class:text-red-500={tokenData ? tokenData.change < 0 : false}
							>
								{#if tokenData}
									${tokenData.change.toFixed(2)}
								{:else}
									<div class="h-3 w-12 animate-pulse rounded bg-gray-600 sm:h-4 sm:w-16"></div>
								{/if}
							</div>
						</div>
						<div class="flex items-center justify-between">
							<div class="text-xs text-gray-400 sm:text-sm">Change %</div>
							<div
								class="text-xs font-medium sm:text-sm"
								class:text-green-500={tokenData ? tokenData.changePercent >= 0 : true}
								class:text-red-500={tokenData ? tokenData.changePercent < 0 : false}
							>
								{#if tokenData}
									{tokenData.changePercent.toFixed(2)}%
								{:else}
									<div class="h-3 w-12 animate-pulse rounded bg-gray-600 sm:h-4 sm:w-16"></div>
								{/if}
							</div>
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/key}
</div>
