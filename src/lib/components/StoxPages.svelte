<script lang="ts">
	import { STOXs, USDC_TOKEN } from '$lib/network';
	import { goto } from '$app/navigation';
	import { orderTokenStore } from '$lib/stores';
	import type { Token } from 'sushi/currency';

	const SECTION_CLASSES = 'bg-gray-800/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10';

	const CARDS_PER_PAGE = 4;
	let currentPage = 0;

	// Calculate total pages
	$: totalPages = Math.ceil(STOXs.length / CARDS_PER_PAGE);

	// Get the tokens for the current page
	$: paginatedTokens = STOXs.slice(
		currentPage * CARDS_PER_PAGE,
		(currentPage + 1) * CARDS_PER_PAGE
	);

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
			orderType: 'limit'
		});

		// Navigate to the neworder page
		goto('/neworder');
	}
</script>

<div class={SECTION_CLASSES}>
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-xl font-semibold">Popular ST0Xs</h2>
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
		<div class="grid w-full grid-cols-4 gap-6">
			{#each paginatedTokens as stox}
				<button
					type="button"
					class="relative flex w-full cursor-pointer flex-col rounded-2xl border border-white/10 bg-gray-800/80 p-5 text-left transition-all duration-200 hover:border-yellow-500/30 hover:bg-gray-700/80"
					on:click={() => handleStoxClick(stox)}
				>
					<div class="flex flex-col gap-3">
						<div class="flex items-center gap-3">
							<img
								src={stox.logoUrl}
								alt={stox.symbol}
								class="h-10 w-10 rounded-full bg-gray-700"
							/>
							<div class="min-w-0 flex-1">
								<div class="truncate font-semibold text-white">{stox.name}</div>
								<div class="text-xs text-gray-400">{stox.symbol}</div>
							</div>
						</div>
						<div class="flex items-center justify-between border-t border-white/5 pt-3">
							<div class="text-sm text-gray-400">Price</div>
							<div class="text-sm font-medium text-green-500">$11.00</div>
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/key}
</div>
