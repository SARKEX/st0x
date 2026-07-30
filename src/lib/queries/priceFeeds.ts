import { createQuery } from '@tanstack/svelte-query';
import { browser } from '$app/environment';
import type { Network } from '$lib/config/network';
import { TOKENS } from '$lib/config/network';
import type { TradingViewQuote } from '$lib/api/tradingview';
import type { MidpointPrice } from '$lib/utils/midpointPrice';

interface PublicPricesResponse {
	success: boolean;
	prices: Record<string, Record<string, MidpointPrice>>;
}

export function marketPriceToQuote(symbol: string, price: MidpointPrice): TradingViewQuote {
	return {
		symbol,
		close: price.price,
		open: null,
		high: null,
		low: null,
		volume: null,
		change: null,
		changeAbs: null,
		changePercent: price.change24hPercent ?? null,
		week52High: null,
		week52Low: null,
		marketCap: null,
		prevClose: null
	};
}

export function createPriceFeedsQuery(network: Network | null) {
	return createQuery<TradingViewQuote[]>({
		queryKey: ['priceFeeds', network?.id],
		enabled: Boolean(browser && network),
		refetchInterval: 15_000,
		queryFn: async () => {
			if (!network) return [];
			const response = await fetch('/api/public/prices');
			if (!response.ok) throw new Error(`Market prices request failed (${response.status})`);
			const data = (await response.json()) as PublicPricesResponse;
			const prices = data.prices?.[String(network.id)] ?? {};
			return TOKENS.filter(
				(token) => token.chainId === network.chainId && token.category === 'ST0x'
			).flatMap((token) => {
				const price = prices[token.address.toLowerCase()];
				return price ? [marketPriceToQuote(token.tradingViewSymbol ?? token.symbol, price)] : [];
			});
		}
	});
}
