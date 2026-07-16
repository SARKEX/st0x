/**
 * TEMP (remove once the renamed raindex Goldsky subgraph is live):
 * Bridge SDK schema v6 (`raindex` / `Raindex`) to the still-deployed
 * `ob4-base/2026-02-05-c4ef` subgraph (`orderbook` / `Orderbook`).
 *
 * Source schema is already renamed:
 * https://github.com/rainlanguage/raindex/blob/main/subgraph/schema.graphql
 * Live Goldsky still serves the pre-rename field names.
 */

import { LEGACY_ORDERBOOK_SUBGRAPH_URL } from '$lib/config/raindexSubgraph';

export { LEGACY_ORDERBOOK_SUBGRAPH_URL, RAINDEX_SUBGRAPH_COMPAT_PATH } from '$lib/config/raindexSubgraph';

/** Rewrite an SDK (modern) GraphQL request body for the legacy subgraph. */
export function rewriteRaindexQueryToLegacy(body: string): string {
	return body.replace(/\bRaindex\b/g, 'Orderbook').replace(/\braindex\b/g, 'orderbook');
}

/**
 * Rewrite a legacy subgraph JSON response for the SDK.
 * Only remaps object keys + `__typename` values — never string payloads —
 * so addresses / meta bytes cannot be corrupted.
 */
export function rewriteOrderbookResponseToModern(body: string): string {
	const data: unknown = JSON.parse(body);
	return JSON.stringify(rewriteKeysDeep(data));
}

const KEY_MAP: Record<string, string> = {
	orderbook: 'raindex',
	Orderbook: 'Raindex'
};

const TYPENAME_MAP: Record<string, string> = {
	Orderbook: 'Raindex'
};

function rewriteKeysDeep(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(rewriteKeysDeep);
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
			const nextKey = KEY_MAP[key] ?? key;
			let nextVal = rewriteKeysDeep(child);
			if (key === '__typename' && typeof child === 'string' && TYPENAME_MAP[child]) {
				nextVal = TYPENAME_MAP[child];
			}
			out[nextKey] = nextVal;
		}
		return out;
	}
	return value;
}

export async function proxyRaindexSubgraphCompat(requestBody: string): Promise<{
	status: number;
	body: string;
}> {
	const upstream = await fetch(LEGACY_ORDERBOOK_SUBGRAPH_URL, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: rewriteRaindexQueryToLegacy(requestBody)
	});
	const text = await upstream.text();
	if (!upstream.ok) {
		return { status: upstream.status, body: text };
	}
	try {
		return { status: upstream.status, body: rewriteOrderbookResponseToModern(text) };
	} catch {
		// Upstream returned non-JSON (rare); pass through unchanged.
		return { status: upstream.status, body: text };
	}
}
