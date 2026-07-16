// ─────────────────────────────────────────────────────────────────────────
// Trade-history → OHLC / volume helpers.
//
// Extracted from trade/[id]/+page.svelte so the home QuickTrade chart and the
// trade page share one implementation. The bucket functions are verbatim; the
// behaviour is unchanged.
// ─────────────────────────────────────────────────────────────────────────
import type {
	TradeHistoryPoint,
	OHLCBucket,
	VolumeBucket
} from '$lib/components/charts/token-chart-types';

// Convert trade points into OHLC candles bucketed by `bucketSeconds`.
export function tradesToOHLCBuckets(
	trades: TradeHistoryPoint[],
	bucketSeconds: number
): OHLCBucket[] {
	if (trades.length === 0) return [];
	const buckets = new Map<number, TradeHistoryPoint[]>();
	for (const trade of trades) {
		const bucketTime = Math.floor(trade.timestamp / 1000 / bucketSeconds) * bucketSeconds * 1000;
		if (!buckets.has(bucketTime)) {
			buckets.set(bucketTime, []);
		}
		buckets.get(bucketTime)!.push(trade);
	}
	const ohlcData: OHLCBucket[] = [];
	const sortedBuckets = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]);
	for (const [time, bucketTrades] of sortedBuckets) {
		if (bucketTrades.length === 0) continue;
		const sortedTrades = bucketTrades
			.filter((t) => Number.isFinite(t.price))
			.sort((a, b) => a.timestamp - b.timestamp);
		if (sortedTrades.length === 0) continue;
		const prices = sortedTrades.map((t) => t.price);
		ohlcData.push({
			x: time,
			o: sortedTrades[0].price,
			h: Math.max(...prices),
			l: Math.min(...prices),
			c: sortedTrades[sortedTrades.length - 1].price
		});
	}
	return ohlcData;
}

// Aggregate traded token volume by the same bucket size as the candles.
export function tradesToVolumeBuckets(
	trades: TradeHistoryPoint[],
	bucketSeconds: number
): VolumeBucket[] {
	if (trades.length === 0) return [];
	const bucketMap = new Map<number, number>();
	for (const trade of trades) {
		const bucketTime = Math.floor(trade.timestamp / 1000 / bucketSeconds) * bucketSeconds * 1000;
		bucketMap.set(bucketTime, (bucketMap.get(bucketTime) ?? 0) + trade.tokens);
	}
	return Array.from(bucketMap.entries())
		.sort((a, b) => a[0] - b[0])
		.map(([start, tokens]) => ({ start, tokens }));
}

export interface ApiTradeLike {
	timestamp: number;
	inputToken?: { address?: string | null } | null;
	outputToken?: { address?: string | null } | null;
	inputAmount: string;
	outputAmount: string;
}

// Convert raw API trades into price/volume history points for a given asset.
// `assetAddresses` is the lowercased set of address variants for the asset;
// `quoteAddress` is the lowercased settlement-token address. Mirrors the
// trade page's tradeHistoryPoints derivation (dedup + chronological sort).
export function apiTradesToHistoryPoints(
	trades: ApiTradeLike[],
	assetAddresses: Set<string>,
	quoteAddress: string
): TradeHistoryPoint[] {
	const quote = quoteAddress.toLowerCase();
	const points: TradeHistoryPoint[] = [];

	for (const trade of trades) {
		const timestamp = trade.timestamp * 1000;
		const inputAddr = trade.inputToken?.address?.toLowerCase();
		const outputAddr = trade.outputToken?.address?.toLowerCase();
		const inputAmount = parseFloat(trade.inputAmount);
		const outputAmount = parseFloat(trade.outputAmount);

		let tokens = 0;
		let quoteAmount = 0;
		let side: 'bid' | 'ask';

		if (assetAddresses.has(inputAddr ?? '') && outputAddr === quote) {
			// Order receives asset, gives quote → bid.
			tokens = Math.abs(inputAmount);
			quoteAmount = Math.abs(outputAmount);
			side = 'bid';
		} else if (assetAddresses.has(outputAddr ?? '') && inputAddr === quote) {
			// Order gives asset, receives quote → ask.
			tokens = Math.abs(outputAmount);
			quoteAmount = Math.abs(inputAmount);
			side = 'ask';
		} else {
			continue;
		}

		if (tokens <= 0) continue;
		const price = quoteAmount / tokens;
		if (!Number.isFinite(price) || price <= 0) continue;

		points.push({ timestamp, price, tokens, quote: quoteAmount, side });
	}

	const seen = new Set<string>();
	return points
		.filter((p) => {
			const key = `${p.timestamp}-${p.price}-${p.tokens}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.timestamp - b.timestamp);
}
