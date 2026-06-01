import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { Network } from '$lib/config/network';
import { TOKENS } from '$lib/config/network';
import { getPythQuotes } from '$lib/api/pyth';
import type { TradingViewQuote } from '$lib/api/tradingview';
import { tokensWithPriceFeed } from '$lib/queries/oracleQuotes';

/** Fetch SPYM price from the liquidity-monitor proxy (no Pyth feed available). */
async function fetchSpymQuote(network: Network): Promise<TradingViewQuote | null> {
	// eslint-disable-next-line no-restricted-syntax -- justification: symbol-based lookup, not address — DRIFT-01 (silent wrapped-only matching) does not apply. getTokenByAnyAddress is address-keyed and cannot resolve by symbol.
	const spymToken = TOKENS.find((t) => t.symbol === 'wtSPYM' && t.chainId === network.chainId);
	if (!spymToken) return null;

	try {
		const res = await fetch('/api/prices/spym');
		if (!res.ok) return null;
		const data = await res.json();
		if (data.price == null) return null;
		return {
			symbol: spymToken.tradingViewSymbol ?? spymToken.symbol ?? null,
			close: data.price,
			open: null,
			high: null,
			low: null,
			volume: null,
			change: null,
			changeAbs: null,
			changePercent: null,
			week52High: null,
			week52Low: null,
			marketCap: null,
			prevClose: null
		};
	} catch {
		return null;
	}
}

export function createPriceFeedsQuery(network: Network | null) {
	return createQuery<TradingViewQuote[]>({
		queryKey: ['priceFeeds', network?.id],
		enabled: Boolean(browser && network),
		refetchInterval: 15_000,
		queryFn: async () => {
			const net = network as Network;
			const [pythQuotes, spymQuote] = await Promise.all([
				getPythQuotes(tokensWithPriceFeed(network), net),
				fetchSpymQuote(net)
			]);
			if (spymQuote) pythQuotes.push(spymQuote);
			return pythQuotes;
		}
	});
}
