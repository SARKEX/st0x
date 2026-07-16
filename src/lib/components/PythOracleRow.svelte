<script lang="ts">
	import { currentNetwork, oracleQuotes } from '$lib/stores';
	import type { OracleQuote } from '$lib/queries/oracleQuotes';
	import type { PythToken } from '$lib/types';
	import type { TradingViewQuote } from '$lib/api/tradingview';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';
	import { createOracleQuotesQuery } from '$lib/queries/oracleQuotes';

	type CommonToken = Partial<PythToken> & {
		symbol?: string;
		address: string;
		tradingViewSymbol?: string;
	};
	export let token: CommonToken;
	export let tokenQuotes: TradingViewQuote[] = [];

	let tokenAddress = '';
	let oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	let oracleQuotesState:
		| import('@tanstack/query-core').QueryObserverResult<Record<string, OracleQuote>, Error>
		| null = null;
	let oracleEntry: OracleQuote | undefined;
	let oracleLoading = false;
	let oracleError: string | null = null;
	let priceData: { price: number | null; confidence: number | null } | null = null;

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
	$: quotePrice = quote?.close ?? null;
	$: tokenAddress = token?.address?.toLowerCase?.() ?? '';
	$: oracleQuotesQuery = createOracleQuotesQuery($currentNetwork);
	$: oracleQuotesState = $oracleQuotesQuery ?? null;
	$: oracleEntry = tokenAddress ? $oracleQuotes[tokenAddress] : undefined;
	$: oracleLoading =
		(oracleQuotesState?.fetchStatus === 'fetching' || oracleQuotesState?.status === 'pending') &&
		Boolean(tokenAddress);
	$: oracleError = (() => {
		if (!tokenAddress) return 'Token missing address';
		if (oracleQuotesState?.status === 'error') {
			return 'Failed to fetch oracle data';
		}
		if (oracleQuotesState?.status === 'success' && !oracleEntry) {
			return 'Oracle data unavailable';
		}
		return null;
	})();
	$: priceData = oracleEntry
		? {
				price: oracleEntry.price ?? null,
				confidence: oracleEntry.confidence ?? null
			}
		: null;
</script>

<!-- Unified Table Row (responsive) -->
<tr>
	{#if oracleLoading}
		<td class="px-2 py-1" colspan="4">
			<div class="flex items-center justify-center">
				<LoadingSpinner size="sm" text="" showText={false} />
			</div>
		</td>
	{:else if oracleError}
		<td class="px-2 py-1 text-red-400" colspan="4">{oracleError}</td>
	{:else if priceData}
		<td class="px-2 py-1">
			<ExternalLink
				href={`${$currentNetwork.blockExplorer}/address/${token.address}`}
				label={token.symbol || ''}
				className="underline"
			/>
		</td>
		<td class="px-2 py-1 text-right">
			{#if typeof priceData.price === 'number'}
				${priceData.price.toFixed(5)}
			{/if}
		</td>
		<td class="px-2 py-1 text-right">
			{#if typeof priceData.confidence === 'number'}
				± {priceData.confidence.toFixed(5)}
			{/if}
		</td>
		<td class="px-2 py-1 text-right text-text-2">
			{#if quotePrice !== null}
				${quotePrice.toFixed(5)}
			{/if}
		</td>
	{:else}
		<td class="px-2 py-1" colspan="4">
			<div class="text-sm text-text-2">Oracle data unavailable</div>
		</td>
	{/if}
</tr>
