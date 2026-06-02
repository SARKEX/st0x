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

import { Float } from '@rainlanguage/float';
import type { DeployedMakerOrder } from '../../helpers/makerOrders';
import type { ApiOrderSummary, ApiOrdersListResponse } from '../../../src/lib/api/st0xApi';

const TOKEN_NAMES = new Map<string, { name: string; symbol: string; decimals: number }>();

const ZERO_BALANCE_HEX =
	'0x0000000000000000000000000000000000000000000000000000000000000000' as const;

/**
 * Encode a human decimal-string balance to the bytes32 Rain Float hex that
 * Goldsky's `SgVault.balance` field carries in production. The SDK's preflight
 * reads this field via `Float.parse` to gate `no_liquidity`; the all-zero
 * placeholder we shipped originally was decoded as 0 and short-circuited the
 * gate even when the on-chain vault was funded.
 *
 * Uses `Float.parse(decimalString)` rather than going via parseUnits + a raw
 * bigint → `Float.fromFixedDecimalLossy(raw, decimals)`. Float is a
 * decimal-floating-point type that carries its own scale, so the string form
 * is the canonical input — matches the production usage in
 * `src/lib/stores/marketTakeStore.ts:124`. The error-union shape
 * (`{ error, value }`) is the WASM SDK's standard result envelope.
 */
function encodeVaultBalanceHex(decimalString: string): string {
	if (!decimalString || Number(decimalString) <= 0) return ZERO_BALANCE_HEX;
	const parsed = Float.parse(decimalString);
	if (parsed.error || !parsed.value) {
		throw new Error(
			`encodeVaultBalanceHex: Float.parse failed for "${decimalString}": ${parsed.error?.readableMsg ?? 'no value'}`
		);
	}
	return parsed.value.asHex();
}

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

interface SgTxRef {
	id: string;
	from: string;
	blockNumber: string;
	timestamp: string;
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
	// The SDK's `SgOrdersListQuery` (see __fixtures__/sample-sgorder-response.json
	// for the canonical shape) explicitly selects addEvents/trades/removeEvents.
	// Omitting them gets a GraphQL response the WASM decoder can't unwrap, so
	// `client.getOrders` returns no orders and the preflight hydration falls
	// through to the `targetedOrders.length === 0` failure path
	// ("Unable to verify orderbook state").
	addEvents: { transaction: SgTxRef }[];
	trades: { id: string }[];
	removeEvents: { transaction: SgTxRef }[];
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
		// Input vault is what the order RECEIVES — nothing deposited there at
		// deploy time, so zero is correct (matches LIVE shape).
		balance: ZERO_BALANCE_HEX,
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
		// Output vault holds the maker's deposit — Float-encoded balance is the
		// signal the SDK preflight checks before quoting; an all-zero placeholder
		// here makes the SDK report `no_liquidity` even though the on-chain
		// vault is funded via the deployment multicall.
		balance: encodeVaultBalanceHex(o.outputVaultBalance),
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

	const txRef: SgTxRef = {
		id: o.txHash.toLowerCase(),
		from: o.owner.toLowerCase(),
		blockNumber: '0',
		timestamp: String(o.timestampAdded)
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
		meta: null,
		addEvents: [{ transaction: txRef }],
		trades: [],
		removeEvents: []
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

	if (parsed.operationName === 'SgVaultsListQuery') {
		// The SDK reads vault balances via a separate vaults query during the
		// preflight hydration (getOrderQuotesBatch / getOrders). Without a stub
		// the request falls through to LIVE Goldsky which doesn't know our
		// anvil-only vaults; the SDK then can't construct a RaindexOrder and
		// the preflight short-circuits to `preflight_chain_unreachable`
		// ("Unable to verify orderbook state"). Synthesize the two vaults per
		// maker order (input + output) from the same encoder used by
		// makerOrderToSgOrder so the Float-encoded balance round-trips.
		const vaults: SgVault[] = [];
		for (const o of makerOrders) {
			const built = makerOrderToSgOrder(o);
			vaults.push(...built.inputs, ...built.outputs);
		}
		return JSON.stringify({ data: { vaults } });
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
 * /api/st0x/v1/orders/token proxy returns. `ioRatio`, `maxOutput`, and
 * `outputVaultBalance` are decimal strings (NOT hex) — `convertApiOrderToProcessedQuote`
 * in src/lib/api/orders.ts:61 runs `Float.parse()` on `ioRatio`/`maxOutput`
 * and `parseFloat()` on `outputVaultBalance` (it drops the order if
 * `parseFloat(outputVaultBalance) <= 0`, so a non-zero decimal is required).
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
		outputVaultBalance: o.outputVaultBalance,
		maxOutput: o.maxOutput,
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
