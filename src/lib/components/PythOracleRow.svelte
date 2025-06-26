<script lang="ts">
    import { TARGET_NETWORK_EXPLORER_URL } from '$lib/network';
    import { HermesClient, type PriceUpdate } from '@pythnetwork/hermes-client';
    import type { PythToken, ApiStockQuote } from '$lib/types';

    export let token: PythToken;
    export let tokenQuotes: ApiStockQuote[] = [];

    let priceUpdatePromise: Promise<PriceUpdate>;
    $: if (token && token.priceFeedId) {
        const hermesClient = new HermesClient('https://hermes.pyth.network');
        priceUpdatePromise = hermesClient.getLatestPriceUpdates([token.priceFeedId]);
    }

    function formatPythPrice(priceUpdate: PriceUpdate) {
        if (!priceUpdate.parsed || priceUpdate.parsed.length === 0) {
            return { price: 0, confidence: 0 };
        }
        const priceInfo = priceUpdate.parsed[0].price;
        return {
            price: Number(priceInfo.price) * Math.pow(10, priceInfo.expo),
            confidence: Number(priceInfo.conf) * Math.pow(10, priceInfo.expo)
        };
    }

    $: quote = token?.symbol
        ? tokenQuotes.find(
            (q) => q?.['Global Quote']?.['01. symbol'] === token?.symbol?.replace(/s1$/, '')
        )
        : undefined;
    $: quotePrice = quote?.['Global Quote']?.['05. price'];
</script>

<!-- Desktop Table Row -->
<tr class="hidden sm:table-row">
    {#await priceUpdatePromise}
        <td class="px-2 py-1" colspan="4">Loading...</td>
    {:then priceUpdate}
        {@const priceData = formatPythPrice(priceUpdate)}
        <td class="px-2 py-1">
            <a href={`${TARGET_NETWORK_EXPLORER_URL}/address/${token.address}`} target="_blank" class="underline">
                {token.symbol}
            </a>
        </td>
        <td class="px-2 py-1 text-right">${priceData.price.toFixed(5)}</td>
        <td class="px-2 py-1 text-right">± ${priceData.confidence.toFixed(5)}</td>
        <td class="px-2 py-1 text-right text-gray-400">
            {#if quotePrice}
                ${parseFloat(quotePrice).toFixed(5)}
            {/if}
        </td>
    {:catch error}
        <td class="px-2 py-1 text-red-400" colspan="4">Error loading pyth price</td>
    {/await}
</tr>

<!-- Mobile Card Row -->
<tr class="sm:hidden">
    <td class="p-2" colspan="4">
        {#await priceUpdatePromise}
            <div class="text-xs">Loading...</div>
        {:then priceUpdate}
            {@const priceData = formatPythPrice(priceUpdate)}
            <div class="flex flex-col gap-1 text-xs">
                <div>
                    <span class="font-semibold">Token: </span>
                    <a href={`${TARGET_NETWORK_EXPLORER_URL}/address/${token.address}`} target="_blank" class="underline">
                        {token.symbol}
                    </a>
                </div>
                <div>
                    <span class="font-semibold">Pyth Price: </span>
                    {priceData.price.toFixed(5)}
                </div>
                <div>
                    <span class="font-semibold">Confidence: </span>
                    ± {priceData.confidence.toFixed(5)}
                </div>
                <div>
                    <span class="font-semibold">Live: </span>
                    {#if quotePrice}
                        ${parseFloat(quotePrice).toFixed(5)}
                    {:else}
                        -
                    {/if}
                </div>
            </div>
        {:catch error}
            <div class="p-2 text-red-400 text-xs">Error loading pyth price</div>
        {/await}
    </td>
</tr> 