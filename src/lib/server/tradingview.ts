const MARKET_ENDPOINTS = {
        america: 'https://scanner.tradingview.com/america/scan',
        crypto: 'https://scanner.tradingview.com/crypto/scan',
        forex: 'https://scanner.tradingview.com/forex/scan',
        indices: 'https://scanner.tradingview.com/indices/scan',
        futures: 'https://scanner.tradingview.com/futures/scan',
        global: 'https://scanner.tradingview.com/tradingview/scan'
} as const;

type MarketKey = keyof typeof MARKET_ENDPOINTS;

export function resolveMarketEndpoint(market: string | null): string {
        if (market && (market as MarketKey) in MARKET_ENDPOINTS) {
                return MARKET_ENDPOINTS[market as MarketKey];
        }
        return MARKET_ENDPOINTS.america;
}

export function coerceTradingViewNumber(value: unknown): number | null {
        if (value === null || value === undefined) return null;
        const num = typeof value === 'number' ? value : Number(value);
        return Number.isFinite(num) ? num : null;
}

export function buildTradingViewScanBody(tickers: string[], columns: string[]) {
        return {
                symbols: {
                        tickers,
                        query: {
                                types: []
                        }
                },
                columns
        };
}

export async function postTradingViewScan(
        endpoint: string,
        fetchFn: typeof fetch,
        body: unknown
) {
        return fetchFn(endpoint, {
                method: 'POST',
                headers: {
                        'content-type': 'application/json'
                },
                body: JSON.stringify(body)
        });
}

export { MARKET_ENDPOINTS };
