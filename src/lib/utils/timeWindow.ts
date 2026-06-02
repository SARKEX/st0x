/**
 * Time-window bucketing for cache-key stability.
 *
 * Trade/order queries derive their window from `Date.now()`. At second
 * granularity the `startTime`/`endTime` query params rotate every second, so
 * the upstream REST API's per-URL cache never gets a hit and every poll is a
 * cold, full fan-out. Flooring the window edge to a coarse bucket makes
 * consecutive requests (within the bucket) share an identical URL — and thus
 * an identical upstream cache key.
 *
 * The bucket must be no coarser than the polling cadence of the surface that
 * uses it, so a manual refresh never hides data the user expects.
 */

/** Default bucket for 30-day trade/order windows — matches the 5-minute client poll. */
export const TRADE_WINDOW_BUCKET_SECONDS = 300;

/**
 * Floors `epochSeconds` down to the start of its `bucketSeconds`-wide bucket.
 * Two timestamps in the same bucket return the same value; adjacent buckets
 * differ by exactly `bucketSeconds`.
 */
export function bucketTimestamp(epochSeconds: number, bucketSeconds: number): number {
	if (bucketSeconds <= 1) return epochSeconds;
	return Math.floor(epochSeconds / bucketSeconds) * bucketSeconds;
}
