<script lang="ts">
	import axios from 'axios';
	import { browser } from '$app/environment';
	import { currentNetwork } from '$lib/stores';
	import type { PythToken } from '$lib/types';
	import type { TradingViewQuote } from '$lib/services/tradingview';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';
	import LoadingSpinner from '$lib/components/LoadingSpinner.svelte';

	type CommonToken = Partial<PythToken> & {
		symbol?: string;
		address: string;
		tradingViewSymbol?: string;
	};
	export let token: CommonToken;
	export let tokenQuotes: TradingViewQuote[] = [];

	let priceData: { price: number; confidence: number } | null = null;
	let error: string | null = null;
	let loading = true;

	function normalizeSymbol(sym?: string) {
		if (!sym) return undefined;
		if (sym.includes('s1')) return sym.split('s1')[0];
		if (sym.includes('0x')) return sym.split('0x')[0];
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

	// Reactive statement that triggers when token changes
	$: if (browser && 'priceFeedId' in token && (token as PythToken).priceFeedId) {
		fetchOracleData();
	}

	async function fetchOracleData() {
		if (!browser) return;
		loading = true;
		error = null;
		priceData = null;

		try {
			const feedId = (token as PythToken).priceFeedId as string;
			const resp = await axios.get(
				`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`
			);
			const parsed = resp.data.parsed?.[0]?.price;
			if (parsed) {
				priceData = {
					price: Number(parsed.price) * Math.pow(10, parsed.expo),
					confidence: Number(parsed.conf) * Math.pow(10, parsed.expo)
				};
			}
		} catch {
			error = 'Failed to fetch oracle data';
		} finally {
			loading = false;
		}
	}
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
		<td class="px-2 py-1 text-right">${priceData.price.toFixed(5)}</td>
		<td class="px-2 py-1 text-right">± {priceData.confidence.toFixed(5)}</td>
		<td class="px-2 py-1 text-right text-gray-400">
			{#if quotePrice !== null}
				${quotePrice.toFixed(5)}
			{/if}
		</td>
	{/if}
</tr>
