export type PriceSource = 'live' | 'cached' | 'historical' | 'unavailable';

/**
 * Website-facing representation of a REST API market price. All calculation,
 * canonicalization, retention, and out-of-hours fallback behavior lives in the
 * REST API.
 */
export interface MidpointPrice {
	price: number | null;
	bid: number | null;
	ask: number | null;
	source: PriceSource;
	/** Epoch milliseconds for compatibility with existing display consumers. */
	asOf: number | null;
	change24hPercent?: number | null;
}
