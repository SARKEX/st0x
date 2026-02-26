// API endpoint to fetch swap order vault contents and legacy token holder balances
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/adminAuth';
import { SWAP_ORDER_HASHES, TOKEN_MIGRATION_MAPPINGS } from '$lib/config/tokenMigration';
import { networks } from '$lib/config/networks';
import { TOKENS } from '$lib/config/tokens';
import { parseFloatHex } from '$lib/utils/tokenMath';
import { formatUnits } from 'viem';

const network = networks[0]; // Base mainnet

// All orderbook subgraph URLs (active + inactive)
const ORDERBOOK_SUBGRAPH_URLS = [
	network.orderbook_subgraph_url,
	...(network.orderbook_subgraph_urls_inactive ?? [])
].filter(Boolean);

// Legacy SFT subgraph URL
const LEGACY_SFT_SUBGRAPH_URL = network.subgraph_urls_legacy[0];

interface SubgraphOrderVault {
	token: { id: string; address: string; symbol: string; decimals: string };
	balance: string;
	vaultId: string;
}

interface SubgraphOrder {
	orderHash: string;
	active: boolean;
	owner: string;
	inputs: SubgraphOrderVault[];
	outputs: SubgraphOrderVault[];
}

interface SwapOrderEntry {
	legacySymbol: string;
	wrappedSymbol: string;
	orderHash: string;
	orderActive: boolean;
	inputVault: { tokenSymbol: string; balance: string; balanceFormatted: string } | null;
	outputVault: { tokenSymbol: string; balance: string; balanceFormatted: string } | null;
}

interface LegacyHolder {
	address: string;
	balance: string;
	balanceFormatted: string;
}

interface LegacyBalanceEntry {
	legacySymbol: string;
	legacyAddress: string;
	wrappedSymbol: string;
	totalSupply: string;
	totalSupplyFormatted: string;
	holderCount: number;
	holders: LegacyHolder[];
}

/**
 * Fetch swap orders from orderbook subgraph(s) by order hash
 */
async function fetchSwapOrders(orderHashes: string[]): Promise<SubgraphOrder[]> {
	const query = `
		query getSwapOrders($orderHashes: [Bytes!]!) {
			orders(where: { orderHash_in: $orderHashes }) {
				orderHash
				active
				owner
				inputs {
					token { id address symbol decimals }
					balance
					vaultId
				}
				outputs {
					token { id address symbol decimals }
					balance
					vaultId
				}
			}
		}
	`;

	const deduped = new Map<string, SubgraphOrder>();

	await Promise.all(
		ORDERBOOK_SUBGRAPH_URLS.map(async (url) => {
			try {
				const response = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ query, variables: { orderHashes } })
				});

				if (!response.ok) return;

				const data = await response.json();
				if (data.errors) return;

				const orders = (data.data?.orders ?? []) as SubgraphOrder[];
				for (const order of orders) {
					if (!deduped.has(order.orderHash)) {
						deduped.set(order.orderHash, order);
					}
				}
			} catch {
				// Silently skip failed subgraphs
			}
		})
	);

	return Array.from(deduped.values());
}

/**
 * Format a vault balance from Rain Float hex to human-readable
 */
function formatVaultBalance(
	vault: SubgraphOrderVault
): { tokenSymbol: string; balance: string; balanceFormatted: string } {
	const decimals = parseInt(vault.token.decimals) || 18;
	const balanceBigInt = parseFloatHex(vault.balance, decimals);
	return {
		tokenSymbol: vault.token.symbol || vault.token.address.slice(0, 10),
		balance: balanceBigInt.toString(),
		balanceFormatted: formatUnits(balanceBigInt, decimals)
	};
}

/**
 * Fetch legacy token holder data from the legacy SFT subgraph
 */
async function fetchLegacyHolders(
	legacyAddresses: string[]
): Promise<LegacyBalanceEntry[]> {
	if (!LEGACY_SFT_SUBGRAPH_URL) return [];

	// Build mapping from legacy address to token info
	const legacyToToken = new Map<string, { legacySymbol: string; wrappedSymbol: string }>();
	for (const mapping of TOKEN_MIGRATION_MAPPINGS) {
		legacyToToken.set(mapping.oldToken.address.toLowerCase(), {
			legacySymbol: mapping.oldToken.symbol,
			wrappedSymbol: mapping.newToken.symbol
		});
	}

	// The legacy SFT subgraph uses the unwrapped/vault address as the entity `id` field,
	// but `wrappedTokenContractAddress` may point to the legacy wrapped token address.
	// Query by both `id` (unwrapped) and `wrappedTokenContractAddress` (wrapped legacy).
	// For legacy tokens, the `address` field = the unwrapped vault address.
	// We also try querying with lowercased legacy addresses directly.
	const addressList = legacyAddresses.map((a) => `"${a.toLowerCase()}"`).join(',');

	// Also get the unwrapped addresses corresponding to legacy tokens
	const unwrappedAddresses = TOKENS.filter((t) => t.legacyAddress && t.unwrappedAddress)
		.map((t) => `"${t.unwrappedAddress!.toLowerCase()}"`)
		.join(',');

	const query = `
		{
			byWrapped: offchainAssetReceiptVaults(where: {
				wrappedTokenContractAddress_in: [${addressList}]
			}) {
				id
				address
				symbol
				totalShares
				tokenHolders {
					address
					balance
				}
			}
			byId: offchainAssetReceiptVaults(where: {
				id_in: [${unwrappedAddresses}]
			}) {
				id
				address
				symbol
				totalShares
				tokenHolders {
					address
					balance
				}
			}
		}
	`;

	try {
		const response = await fetch(LEGACY_SFT_SUBGRAPH_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ query })
		});

		if (!response.ok) {
			console.error(`[Swap Snapshot] Legacy subgraph returned ${response.status}`);
			return [];
		}

		const data = await response.json();
		if (data.errors) {
			console.error('[Swap Snapshot] Legacy subgraph errors:', data.errors);
		}

		// Merge results from both query paths, dedup by id
		const byWrapped = (data.data?.byWrapped ?? []) as Array<{
			id: string;
			address: string;
			symbol: string;
			totalShares: string;
			tokenHolders: Array<{ address: string; balance: string }>;
		}>;
		const byId = (data.data?.byId ?? []) as typeof byWrapped;
		const seen = new Set<string>();
		const allVaults = [...byWrapped, ...byId].filter((v) => {
			if (seen.has(v.id)) return false;
			seen.add(v.id);
			return true;
		});

		const entries: LegacyBalanceEntry[] = [];

		for (const vault of allVaults) {
			// Match vault to our known legacy tokens
			// The vault's address (unwrapped) maps to a TOKENS entry's unwrappedAddress
			const token = TOKENS.find(
				(t) =>
					t.unwrappedAddress?.toLowerCase() === vault.id.toLowerCase() ||
					t.unwrappedAddress?.toLowerCase() === vault.address?.toLowerCase() ||
					t.legacyAddress?.toLowerCase() === vault.id.toLowerCase()
			);

			const tokenInfo = token?.legacyAddress
				? legacyToToken.get(token.legacyAddress.toLowerCase())
				: null;

			if (!tokenInfo) continue;

			// Filter to non-zero holders
			const holders: LegacyHolder[] = vault.tokenHolders
				.filter((h) => {
					try {
						return BigInt(h.balance) > 0n;
					} catch {
						return false;
					}
				})
				.map((h) => {
					const bal = BigInt(h.balance);
					return {
						address: h.address,
						balance: bal.toString(),
						balanceFormatted: formatUnits(bal, 18)
					};
				})
				.sort((a, b) => {
					const diff = BigInt(b.balance) - BigInt(a.balance);
					return diff > 0n ? 1 : diff < 0n ? -1 : 0;
				});

			let totalSupplyBigInt: bigint;
			try {
				totalSupplyBigInt = BigInt(vault.totalShares);
			} catch {
				totalSupplyBigInt = 0n;
			}

			entries.push({
				legacySymbol: tokenInfo.legacySymbol,
				legacyAddress: token!.legacyAddress!,
				wrappedSymbol: tokenInfo.wrappedSymbol,
				totalSupply: totalSupplyBigInt.toString(),
				totalSupplyFormatted: formatUnits(totalSupplyBigInt, 18),
				holderCount: holders.length,
				holders
			});
		}

		return entries;
	} catch (error) {
		console.error('[Swap Snapshot] Legacy subgraph fetch failed:', error);
		return [];
	}
}

export const GET: RequestHandler = async ({ cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-swap-snapshot');
	if (guardResponse) return guardResponse;

	try {
		// Get all swap order hashes
		const orderHashes = Object.values(SWAP_ORDER_HASHES);

		// Fetch swap orders and legacy holders in parallel
		const legacyAddresses = TOKEN_MIGRATION_MAPPINGS.map((m) => m.oldToken.address);
		const [orders, legacyBalances] = await Promise.all([
			fetchSwapOrders(orderHashes),
			fetchLegacyHolders(legacyAddresses)
		]);

		// Build order lookup by hash
		const orderByHash = new Map(orders.map((o) => [o.orderHash, o]));

		// Build swap order entries for each token migration
		const swapOrders: SwapOrderEntry[] = TOKEN_MIGRATION_MAPPINGS.filter(
			(m) => m.swapOrderHash
		).map((mapping) => {
			const order = orderByHash.get(mapping.swapOrderHash);

			if (!order) {
				return {
					legacySymbol: mapping.oldToken.symbol,
					wrappedSymbol: mapping.newToken.symbol,
					orderHash: mapping.swapOrderHash,
					orderActive: false,
					inputVault: null,
					outputVault: null
				};
			}

			// Input vault = what the order receives (legacy tokens from users)
			const inputVault = order.inputs[0] ? formatVaultBalance(order.inputs[0]) : null;
			// Output vault = what the order gives away (wrapped tokens to users)
			const outputVault = order.outputs[0] ? formatVaultBalance(order.outputs[0]) : null;

			return {
				legacySymbol: mapping.oldToken.symbol,
				wrappedSymbol: mapping.newToken.symbol,
				orderHash: mapping.swapOrderHash,
				orderActive: order.active,
				inputVault,
				outputVault
			};
		});

		return json({
			success: true,
			swapOrders,
			legacyBalances
		});
	} catch (error) {
		console.error('[Swap Snapshot] Error:', error);
		return json(
			{
				success: false,
				swapOrders: [],
				legacyBalances: [],
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
