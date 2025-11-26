import type { TradingViewQuote } from '$lib/api/tradingview';
import type { CategorizedToken } from '$lib/config/network';

type MaybeSymbol = string | null | undefined;

type TokenLike = Pick<CategorizedToken, 'symbol' | 'tradingViewSymbol'>;

export function extractBaseSymbol(symbol: MaybeSymbol): string | undefined {
	if (!symbol) return undefined;
	const trimmed = symbol.trim();
	if (!trimmed) return undefined;
	if (trimmed.startsWith('t') && trimmed.length > 1) {
		return trimmed.slice(1);
	}
	return trimmed;
}

function tokensMatch(symbol: MaybeSymbol, tokens: TokenLike[]): TokenLike | undefined {
	const base = extractBaseSymbol(symbol);
	if (!base) return undefined;
	const upper = base.toUpperCase();
	return tokens.find((token) => extractBaseSymbol(token.symbol)?.toUpperCase() === upper);
}

export function findTradingViewSymbol(
	symbol: MaybeSymbol,
	tokens: TokenLike[] = []
): string | undefined {
	const match = tokensMatch(symbol, tokens);
	const candidate = match?.tradingViewSymbol?.trim();
	return candidate ? candidate : undefined;
}

export function findQuoteForSymbol(
	symbol: MaybeSymbol,
	quotes: TradingViewQuote[] | null | undefined,
	tokens: TokenLike[] = []
): TradingViewQuote | undefined {
	if (!quotes?.length) return undefined;
	const tradingSymbol = findTradingViewSymbol(symbol, tokens);
	if (tradingSymbol) {
		const tsUpper = tradingSymbol.toUpperCase();
		const direct = quotes.find((quote) => (quote.symbol ?? '').toUpperCase() === tsUpper);
		if (direct) {
			return direct;
		}
	}
	const base = extractBaseSymbol(symbol)?.toUpperCase();
	if (!base) return undefined;
	return quotes.find((quote) => {
		const quoteSymbol = (quote.symbol ?? '').toUpperCase();
		if (quoteSymbol === base) return true;
		const parts = quoteSymbol.split(':');
		return parts[parts.length - 1] === base;
	});
}
