// API endpoint to fetch swap order vault contents and legacy token holder balances
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/adminAuth';
import { SWAP_ORDER_HASHES, TOKEN_MIGRATION_MAPPINGS } from '$lib/config/tokenMigration';
import { networks } from '$lib/config/networks';
import { ORDERBOOK_ADDRESS, SYSTEM_EXCLUDED_ADDRESSES } from '$lib/config/snapshots';
import { getTeamWalletsSet } from '$lib/server/kv';
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
	legacyOutstanding: string;
	legacyOutstandingFormatted: string;
	teamLegacy: string;
	teamLegacyFormatted: string;
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

	// The legacy SFT subgraph (v1.0.5) vault IDs are the legacy token addresses themselves.
	// It does NOT have wrappedTokenContractAddress — query by id only.
	const addressList = legacyAddresses.map((a) => `"${a.toLowerCase()}"`).join(',');

	const query = `
		{
			offchainAssetReceiptVaults(where: {
				id_in: [${addressList}]
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

		const allVaults = (data.data?.offchainAssetReceiptVaults ?? []) as Array<{
			id: string;
			address: string;
			symbol: string;
			totalShares: string;
			tokenHolders: Array<{ address: string; balance: string }>;
		}>;

		const entries: LegacyBalanceEntry[] = [];

		for (const vault of allVaults) {
			// Vault id in the legacy subgraph IS the legacy token address
			const tokenInfo = legacyToToken.get(vault.id.toLowerCase());

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
				legacyAddress: vault.id,
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

		// Fetch swap orders, legacy holders, and team wallets in parallel
		const legacyAddresses = TOKEN_MIGRATION_MAPPINGS.map((m) => m.oldToken.address);
		const [orders, legacyBalances, teamWallets] = await Promise.all([
			fetchSwapOrders(orderHashes),
			fetchLegacyHolders(legacyAddresses),
			getTeamWalletsSet()
		]);

		// Build order lookup by hash
		const orderByHash = new Map(orders.map((o) => [o.orderHash, o]));

		// Build legacy balance lookup by symbol for computing outstanding/team amounts
		const legacyBySymbol = new Map(legacyBalances.map((lb) => [lb.legacySymbol, lb]));

		// Addresses to exclude from "outstanding" (not held by real users)
		const systemExcluded = new Set([
			ORDERBOOK_ADDRESS.toLowerCase(),
			...SYSTEM_EXCLUDED_ADDRESSES.map((a) => a.toLowerCase())
		]);

		// Build swap order entries for each token migration
		const swapOrders: SwapOrderEntry[] = TOKEN_MIGRATION_MAPPINGS.filter(
			(m) => m.swapOrderHash
		).map((mapping) => {
			const order = orderByHash.get(mapping.swapOrderHash);

			// Compute legacy outstanding and team legacy from holder data
			const legacyEntry = legacyBySymbol.get(mapping.oldToken.symbol);
			let outstandingBigInt = 0n;
			let teamBigInt = 0n;
			if (legacyEntry) {
				for (const holder of legacyEntry.holders) {
					const addr = holder.address.toLowerCase();
					const bal = BigInt(holder.balance);
					if (systemExcluded.has(addr)) continue;
					outstandingBigInt += bal;
					if (teamWallets.has(addr)) {
						teamBigInt += bal;
					}
				}
			}

			if (!order) {
				return {
					legacySymbol: mapping.oldToken.symbol,
					wrappedSymbol: mapping.newToken.symbol,
					orderHash: mapping.swapOrderHash,
					orderActive: false,
					inputVault: null,
					outputVault: null,
					legacyOutstanding: outstandingBigInt.toString(),
					legacyOutstandingFormatted: formatUnits(outstandingBigInt, 18),
					teamLegacy: teamBigInt.toString(),
					teamLegacyFormatted: formatUnits(teamBigInt, 18)
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
				outputVault,
				legacyOutstanding: outstandingBigInt.toString(),
				legacyOutstandingFormatted: formatUnits(outstandingBigInt, 18),
				teamLegacy: teamBigInt.toString(),
				teamLegacyFormatted: formatUnits(teamBigInt, 18)
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
