/**
 * Cache the REST API's sampled market-price response across website clients.
 * The sampler runs independently in the REST service; the website only needs
 * to refresh often enough to pick up the latest completed sample.
 */
export const PUBLIC_PRICES_TTL_SECONDS = 90;
export const PUBLIC_PRICES_REFRESH_INTERVAL_MS = PUBLIC_PRICES_TTL_SECONDS * 1_000;
export const PUBLIC_PRICES_CACHE_CONTROL = `public, s-maxage=${PUBLIC_PRICES_TTL_SECONDS}, stale-while-revalidate=${
	PUBLIC_PRICES_TTL_SECONDS * 3
}`;
