<script lang="ts">
    import { STOXs } from '$lib/network';
    import { goto } from '$app/navigation';
    
    
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
        <div 
            class="grid grid-cols-4 gap-6 w-full" 
        >
            {#each paginatedTokens as stox}
                <button 
                    type="button"
                    class="rounded-2xl bg-gray-800/80 border border-white/10 p-5 relative flex flex-col cursor-pointer hover:bg-gray-700/80 hover:border-yellow-500/30 transition-all duration-200 text-left w-full" 
                    on:click={() => goto('/neworder')}
                >
                    <div class="flex flex-col gap-3">
                        <div class="flex items-center gap-3">
                            <img src={stox.logoUrl} alt={stox.symbol} class="w-10 h-10 rounded-full bg-gray-700" />
                            <div class="flex-1 min-w-0">
                                <div class="font-semibold text-white truncate">{stox.name}</div>
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
            {#each Array(CARDS_PER_PAGE - paginatedTokens.length) as _}
                <div></div>
            {/each}
        </div>
    {/key}
</div>