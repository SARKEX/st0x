/**
 * Shared Raindex subgraph endpoints / compat proxy path.
 * Keep rewrite logic in `$lib/server/raindexSubgraphCompat` (server-only).
 */

/** Still-live Goldsky deployment (pre-rename `orderbook` schema). */
export const LEGACY_ORDERBOOK_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-02-05-c4ef/gn';

/**
 * TEMP same-origin proxy that rewrites raindex↔orderbook for SDK v6.
 * Remove once the renamed Goldsky subgraph URL is wired in.
 */
export const RAINDEX_SUBGRAPH_COMPAT_PATH = '/api/public/raindex-subgraph-compat';
