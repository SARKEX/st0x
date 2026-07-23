/**
 * A price refresh fans out to 27 token endpoints against a 60-request rolling
 * 60-second per-key limit. Ninety seconds keeps normal refresh bursts in
 * separate limiter windows while reserving capacity for interactive traffic.
 */
export const PUBLIC_PRICES_TTL_SECONDS = 90;
export const PUBLIC_PRICES_REFRESH_INTERVAL_MS = PUBLIC_PRICES_TTL_SECONDS * 1_000;
export const PUBLIC_PRICES_CACHE_CONTROL = `public, s-maxage=${PUBLIC_PRICES_TTL_SECONDS}, stale-while-revalidate=${
	PUBLIC_PRICES_TTL_SECONDS * 3
}`;
