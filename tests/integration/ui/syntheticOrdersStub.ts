// Goldsky + REST stub helpers for the maker→taker model.
//
// In Path B of the architectural pivot (see HANDOVER-2026-05-18.md and the
// follow-up handover for this iteration), we deploy maker orders directly to
// anvil. The subgraph never sees these orders (it indexes LIVE Base mainnet).
// To make the UI see them, we synthesize:
//   1. `SgOrdersListQuery` Goldsky GraphQL responses
//   2. `/api/st0x/v1/orders/token/<addr>` REST API responses
//
// The shape of the Goldsky response is captured in
// `tests/integration/ui/__fixtures__/sample-sgorder-response.json` from a
// real LIVE query (see scripts/probe-goldsky.mjs).
//
// Each test registers its maker orders with `registerMakerOrders()` at setup
// time. The stubs then surface those orders to the UI through both data paths.

import type { DeployedMakerOrder } from '../../helpers/makerOrders';
import type { ApiOrderSummary, ApiOrdersListResponse } from '../../../src/lib/api/st0xApi';

const TOKEN_NAMES = new Map<string, { name: string; symbol: string; decimals: number }>();

// Module-scoped registry of maker orders this worker has deployed. Cleared
// between tests via `clearMakerOrders()` from afterEach hooks.
const makerOrders: DeployedMakerOrder[] = [];

export function registerMakerOrders(...orders: DeployedMakerOrder[]): void {
	makerOrders.push(...orders);
	for (const o of orders) {
		TOKEN_NAMES.set(o.inputToken.address.toLowerCase(), {
			name: o.inputToken.symbol,
			symbol: o.inputToken.symbol,
			decimals: o.inputToken.decimals
		});
		TOKEN_NAMES.set(o.outputToken.address.toLowerCase(), {
			name: o.outputToken.symbol,
			symbol: o.outputToken.symbol,
			decimals: o.outputToken.decimals
		});
	}
}

export function clearMakerOrders(): void {
	makerOrders.length = 0;
	TOKEN_NAMES.clear();
}

export function getMakerOrders(): readonly DeployedMakerOrder[] {
	return makerOrders;
}

interface SgVault {
	id: string;
	owner: string;
	vaultId: string;
	balance: string;
	token: { id: string; address: string; name: string; symbol: string; decimals: string };
	orderbook: { id: string };
	ordersAsOutput: Array<{ id: string; orderHash: string; active: boolean }>;
	ordersAsInput: Array<{ id: string; orderHash: string; active: boolean }>;
	balanceChanges: unknown[];
}

interface SgOrder {
	id: string;
	orderBytes: string;
	orderHash: string;
	owner: string;
	outputs: SgVault[];
	inputs: SgVault[];
	orderbook: { id: string };
	active: boolean;
	timestampAdded: string;
	meta: string | null;
}

/**
 * Build the synthetic SgOrder JSON for a deployed maker order. Mirrors the
 * captured fixture shape — same fields, ordered identically (a subset of fields
 * the SDK actually inspects via WASM; the rest are harmless extras the
 * production schema includes).
 */
function makerOrderToSgOrder(o: DeployedMakerOrder): SgOrder {
	const orderbookId = o.orderbookAddress.toLowerCase();
	// Entity IDs in the subgraph: vault.id = keccak(owner|vaultId|token); we
	// synthesize a deterministic ID — the SDK doesn't seem to depend on it.
	const synthVaultId = (token: string, vaultId: string) =>
		`0x${[token.slice(2), vaultId.slice(2), o.owner.slice(2)].join('').slice(0, 64)}`;

	const inputVault: SgVault = {
		id: synthVaultId(o.inputToken.address, o.inputVaultId),
		owner: o.owner.toLowerCase(),
		vaultId: o.inputVaultId,
		balance:
			'0x0000000000000000000000000000000000000000000000000000000000000000',
		token: {
			id: o.inputToken.address.toLowerCase(),
			address: o.inputToken.address.toLowerCase(),
			name: o.inputToken.symbol,
			symbol: o.inputToken.symbol,
			decimals: String(o.inputToken.decimals)
		},
		orderbook: { id: orderbookId },
		ordersAsOutput: [],
		ordersAsInput: [
			{ id: o.orderHash.toLowerCase(), orderHash: o.orderHash, active: true }
		],
		balanceChanges: []
	};
	const outputVault: SgVault = {
		id: synthVaultId(o.outputToken.address, o.outputVaultId),
		owner: o.owner.toLowerCase(),
		vaultId: o.outputVaultId,
		balance:
			'0x0000000000000000000000000000000000000000000000000000000000000000',
		token: {
			id: o.outputToken.address.toLowerCase(),
			address: o.outputToken.address.toLowerCase(),
			name: o.outputToken.symbol,
			symbol: o.outputToken.symbol,
			decimals: String(o.outputToken.decimals)
		},
		orderbook: { id: orderbookId },
		ordersAsOutput: [
			{ id: o.orderHash.toLowerCase(), orderHash: o.orderHash, active: true }
		],
		ordersAsInput: [],
		balanceChanges: []
	};

	return {
		id: o.orderHash.toLowerCase(),
		orderBytes: o.orderBytes,
		orderHash: o.orderHash,
		owner: o.owner.toLowerCase(),
		outputs: [outputVault],
		inputs: [inputVault],
		orderbook: { id: orderbookId },
		active: true,
		timestampAdded: String(o.timestampAdded),
		meta: null
	};
}

/**
 * Try to handle a Goldsky GraphQL request by serving from the maker-order
 * registry. Returns the JSON body to fulfill with, or null if the request
 * should pass through to the cache/LIVE stub.
 */
export function handleGoldskyRequest(body: string | null): string | null {
	if (!body || !makerOrders.length) return null;
	let parsed: { query?: string; operationName?: string; variables?: Record<string, unknown> };
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}

	if (parsed.operationName === 'SgOrdersListQuery') {
		const filters = (parsed.variables?.filters ?? {}) as {
			orderHash?: string;
			orderHash_in?: string[];
			owner_in?: string[];
		};
		// Apply filter against our maker orders
		const wanted = new Set<string>();
		if (filters.orderHash) wanted.add(filters.orderHash.toLowerCase());
		for (const h of filters.orderHash_in ?? []) wanted.add(h.toLowerCase());
		const matched =
			wanted.size > 0
				? makerOrders.filter((o) => wanted.has(o.orderHash.toLowerCase()))
				: makerOrders; // unfiltered → return all
		const orders = matched.map(makerOrderToSgOrder);
		return JSON.stringify({ data: { orders } });
	}

	if (parsed.operationName === 'MetasBySubject') {
		// Maker orders have no on-chain meta (we don't emit metaboard entries
		// from anvil). Return empty so the SDK doesn't dereference.
		return JSON.stringify({ data: { metaV1S: [] } });
	}

	return null;
}

/**
 * Convert a DeployedMakerOrder to the ApiOrderSummary shape the production
 * /api/st0x/v1/orders/token proxy returns. Slim — `maxOutput` and `ioRatio` are
 * left blank for now; the SDK preflight against anvil quote() will populate
 * actual on-chain values when the UI hydrates.
 */
function makerOrderToApiSummary(o: DeployedMakerOrder): ApiOrderSummary {
	return {
		orderHash: o.orderHash,
		owner: o.owner,
		orderBytes: o.orderBytes,
		inputToken: {
			address: o.inputToken.address,
			symbol: o.inputToken.symbol,
			decimals: o.inputToken.decimals
		},
		outputToken: {
			address: o.outputToken.address,
			symbol: o.outputToken.symbol,
			decimals: o.outputToken.decimals
		},
		outputVaultBalance: '0x0',
		maxOutput: o.ioRatio,
		ioRatio: o.ioRatio,
		createdAt: o.timestampAdded,
		orderbookId: o.orderbookAddress.toLowerCase()
	};
}

/**
 * Build a fully-synthetic /api/st0x/v1/orders/token response from the maker
 * registry, filtered to orders involving `tokenAddress` on the given `side`.
 *   side='output' → orders that GIVE this token (sells of this asset)
 *   side='input'  → orders that RECEIVE this token (buys of this asset)
 *   side=undefined → both
 */
export function buildSyntheticOrdersResponse(
	tokenAddress: string,
	side?: 'input' | 'output'
): ApiOrdersListResponse {
	const addr = tokenAddress.toLowerCase();
	const filtered = makerOrders.filter((o) => {
		const isInput = o.inputToken.address.toLowerCase() === addr;
		const isOutput = o.outputToken.address.toLowerCase() === addr;
		if (side === 'input') return isInput;
		if (side === 'output') return isOutput;
		return isInput || isOutput;
	});
	const orders = filtered.map(makerOrderToApiSummary);
	return {
		orders,
		pagination: {
			page: 1,
			pageSize: orders.length,
			totalOrders: orders.length,
			totalPages: 1,
			hasMore: false
		}
	};
}
