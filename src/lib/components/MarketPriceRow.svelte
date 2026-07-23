<script lang="ts">
	import { currentNetwork } from '$lib/stores';
	import type { PythToken } from '$lib/types';
	import type { TradingViewQuote } from '$lib/api/tradingview';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { createMidpointPricesQuery, getMidpointPrice } from '$lib/queries/midpointPrices';

	type CommonToken = Partial<PythToken> & {
		symbol?: string;
		address: string;
		tradingViewSymbol?: string;
	};
	export let token: CommonToken;
	export let tokenQuotes: TradingViewQuote[] = [];

	let tokenAddress = '';
	let midpointQuery = createMidpointPricesQuery($currentNetwork);
	let midpointState:
		| import('@tanstack/query-core').QueryObserverResult<
				Record<string, import('$lib/queries/midpointPrices').MidpointPrice>,
				Error
		  >
		| null = null;

	function normalizeSymbol(sym?: string) {
		if (!sym) return undefined;
		if (sym.includes('t')) return sym.split('t')[1];
		return sym;
	}

	function matchesQuote(quote: TradingViewQuote, tokenSymbol?: string, override?: string) {
		const quoteSymbol = quote.symbol ?? '';
		const target = override ?? tokenSymbol;
		if (!target) return false;
		if (override && quoteSymbol.toUpperCase() === override.toUpperCase()) return true;
		const normalized = normalizeSymbol(target);
		if (!normalized) return false;
		const [, sym] = quoteSymbol.split(':');
		return (
			quoteSymbol.toUpperCase() === normalized.toUpperCase() ||
			(sym ? sym.toUpperCase() === normalized.toUpperCase() : false)
		);
	}

	$: quote = tokenQuotes.find((q) => matchesQuote(q, token?.symbol, token?.tradingViewSymbol));
	$: change24hPercent = quote?.changePercent ?? null;
	$: tokenAddress = token?.address?.toLowerCase?.() ?? '';
	$: midpointQuery = createMidpointPricesQuery($currentNetwork);
	$: midpointState = $midpointQuery ?? null;
	$: entry = getMidpointPrice(midpointState?.data, tokenAddress);
	$: loading =
		!entry &&
		(midpointState?.fetchStatus === 'fetching' || midpointState?.status === 'pending') &&
		Boolean(tokenAddress);
	$: error = (() => {
		if (!tokenAddress) return 'Token missing address';
		if (midpointState?.status === 'error' && !entry) return 'Failed to fetch price data';
		return null;
	})();
	// Only render a price when we have a real one (live or cached). A one-sided book resolves
	// to `unavailable` (price null) and must show N/A — never a fabricated midpoint.
	$: priceData =
		entry && entry.price != null
			? { price: entry.price, bid: entry.bid, ask: entry.ask, source: entry.source }
			: null;
</script>

<!-- Unified Table Row (responsive) -->
<tr>
	{#if loading}
		<td class="px-2 py-1" colspan="4">
			<div class="flex items-center justify-center">
				<LoadingSpinner size="sm" text="" showText={false} />
			</div>
		</td>
	{:else if error}
		<td class="px-2 py-1 text-red-400" colspan="4">{error}</td>
	{:else if priceData}
		<td class="px-2 py-1">
			<ExternalLink
				href={`${$currentNetwork.blockExplorer}/address/${token.address}`}
				label={token.symbol || ''}
				className="underline"
			/>
		</td>
		<td
			class="px-2 py-1 text-right"
			title={priceData.source === 'cached'
				? 'Last known midpoint (market closed or one-sided book)'
				: ''}
		>
			${priceData.price.toFixed(5)}{#if priceData.source === 'cached'}<span class="text-text-3">
					*</span
				>{/if}
		</td>
		<td class="whitespace-nowrap px-2 py-1 text-right text-text-2">
			{#if priceData.bid != null && priceData.ask != null}
				${priceData.bid.toFixed(4)} / ${priceData.ask.toFixed(4)}
			{/if}
		</td>
		<td class="px-2 py-1 text-right text-text-2">
			{#if change24hPercent !== null}
				<span
					class:text-green-400={change24hPercent >= 0}
					class:text-red-400={change24hPercent < 0}
				>
					{change24hPercent >= 0 ? '+' : ''}{change24hPercent.toFixed(2)}%
				</span>
			{/if}
		</td>
	{:else}
		<td class="px-2 py-1" colspan="4">
			<div class="text-sm text-text-2">Price unavailable</div>
		</td>
	{/if}
</tr>
