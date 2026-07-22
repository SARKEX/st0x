/**
 * Midpoint price resolution — the single home of the "never show a wrong price" rule.
 *
 * The displayed price for the sidebar, homepage table and strategy price tables is the
 * midpoint of the best bid and best ask, `(bid + ask) / 2`. A midpoint is only ever
 * derived when BOTH sides of the book are present and positive. When one side is zero,
 * missing, or non-finite (market closed, thin book) we must NEVER fabricate a live price —
 * a one-sided midpoint would be badly wrong. Instead we fall back to the last valid
 * midpoint we cached, and failing that we surface N/A.
 *
 * This module is pure (no I/O). The endpoint feeds it live bid/ask and the persisted
 * last-known map, and persists the returned `nextLastKnown` back to KV.
 */

export type PriceSource = 'live' | 'cached' | 'unavailable';

export interface MidpointPrice {
	/** Midpoint price in payment-token units per asset token, or null when unavailable. */
	price: number | null;
	bid: number | null;
	ask: number | null;
	source: PriceSource;
	/** Epoch ms the price was captured from a live two-sided book, or null when unavailable. */
	asOf: number | null;
}

/** Last valid two-sided midpoint, persisted (no expiry) as the fallback for a token. */
export interface LastKnownMidpoint {
	mid: number;
	bid: number;
	ask: number;
	updatedAt: number;
}

export interface TokenBidAsk {
	/** Canonical token address (any casing — normalized internally). */
	address: string;
	bid?: number;
	ask?: number;
}

/**
 * Merge a token's bid/ask across its address variants (wrapped + legacy). Mirrors the
 * orderbook aggregation rule: best bid is the highest, best ask is the lowest, and only
 * strictly-positive finite values count.
 */
export function pickBestBidAsk(entries: Array<{ bid?: number; ask?: number } | undefined>): {
	bid?: number;
	ask?: number;
} {
	let bid: number | undefined;
	let ask: number | undefined;
	for (const entry of entries) {
		if (!entry) continue;
		if (typeof entry.bid === 'number' && Number.isFinite(entry.bid) && entry.bid > 0) {
			bid = bid === undefined ? entry.bid : Math.max(bid, entry.bid);
		}
		if (typeof entry.ask === 'number' && Number.isFinite(entry.ask) && entry.ask > 0) {
			ask = ask === undefined ? entry.ask : Math.min(ask, entry.ask);
		}
	}
	return { bid, ask };
}

/** A midpoint may only be derived when both sides are present and strictly positive. */
export function isValidTwoSided(
	bid: number | undefined | null,
	ask: number | undefined | null
): boolean {
	return (
		typeof bid === 'number' &&
		Number.isFinite(bid) &&
		bid > 0 &&
		typeof ask === 'number' &&
		Number.isFinite(ask) &&
		ask > 0
	);
}

/**
 * Resolve a single token's displayable price from its live book and cached fallback.
 *
 * @returns the price to display plus the last-known entry to persist. For live prices the
 * entry is refreshed; otherwise the existing `lastKnown` is returned unchanged (or undefined).
 */
export function resolveMidpoint(
	bidAsk: { bid?: number; ask?: number } | undefined,
	lastKnown: LastKnownMidpoint | undefined,
	now: number
): { price: MidpointPrice; nextLastKnown: LastKnownMidpoint | undefined } {
	const bid = bidAsk?.bid;
	const ask = bidAsk?.ask;

	if (isValidTwoSided(bid, ask)) {
		const mid = (bid! + ask!) / 2;
		const entry: LastKnownMidpoint = { mid, bid: bid!, ask: ask!, updatedAt: now };
		return {
			price: { price: mid, bid: bid!, ask: ask!, source: 'live', asOf: now },
			nextLastKnown: entry
		};
	}

	if (lastKnown) {
		return {
			price: {
				price: lastKnown.mid,
				bid: lastKnown.bid,
				ask: lastKnown.ask,
				source: 'cached',
				asOf: lastKnown.updatedAt
			},
			nextLastKnown: lastKnown
		};
	}

	return {
		price: { price: null, bid: null, ask: null, source: 'unavailable', asOf: null },
		nextLastKnown: undefined
	};
}

/**
 * Resolve a batch of tokens. Returns the per-address price map, the next last-known map to
 * persist, and how many tokens resolved to a fresh live price (so the caller can skip the
 * KV write entirely when nothing new was learned — avoids clobbering history on a transient
 * upstream/KV failure).
 */
export function resolveMidpoints(
	tokens: TokenBidAsk[],
	lastKnown: Record<string, LastKnownMidpoint>,
	now: number
): {
	prices: Record<string, MidpointPrice>;
	nextLastKnown: Record<string, LastKnownMidpoint>;
	liveCount: number;
} {
	const prices: Record<string, MidpointPrice> = {};
	const nextLastKnown: Record<string, LastKnownMidpoint> = { ...lastKnown };
	let liveCount = 0;

	for (const token of tokens) {
		const addr = token.address.toLowerCase();
		const { price, nextLastKnown: entry } = resolveMidpoint(
			{ bid: token.bid, ask: token.ask },
			lastKnown[addr],
			now
		);
		prices[addr] = price;
		if (price.source === 'live' && entry) {
			liveCount += 1;
			nextLastKnown[addr] = entry;
		}
	}

	return { prices, nextLastKnown, liveCount };
}
