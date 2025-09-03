<script lang="ts">
	import axios from 'axios';
	import { currentNetwork } from '$lib/stores';
	import type { PythToken, ApiStockQuote } from '$lib/types';
	import ExternalLink from '$lib/components/ui/ExternalLink.svelte';

	type CommonToken = Partial<PythToken> & { symbol?: string; address: string };
	export let token: CommonToken;
	export let tokenQuotes: ApiStockQuote[] = [];

	let priceData: { price: number; confidence: number } | null = null;
	let error: string | null = null;
	let loading = true;

	$: quote = token?.symbol
		? tokenQuotes.find(
				(q) => q?.['Global Quote']?.['01. symbol'] === token?.symbol?.replace(/s1$/, '')
			)
		: undefined;
	$: quotePrice = quote?.['Global Quote']?.['05. price'];

	// Reactive statement that triggers when token changes
	$: if ('priceFeedId' in token && (token as PythToken).priceFeedId) {
		fetchOracleData();
	}

	async function fetchOracleData() {
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
		<td class="px-2 py-1" colspan="4">Loading...</td>
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
			{#if quotePrice}
				${parseFloat(quotePrice).toFixed(5)}
			{/if}
		</td>
	{/if}
</tr>
