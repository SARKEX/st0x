// Query vault holdings from the Rain orderbook subgraph
// Used to attribute orderbook holdings to vault owners

import { networks } from '$lib/config/networks';
import { TOKENS } from '$lib/config/tokens';
import { parseFloatHex } from '$lib/utils/tokenMath';

const BATCH_SIZE = 1000;

// Get orderbook subgraph URL from network config
const ORDERBOOK_SUBGRAPH_URL = networks[0].orderbook_subgraph_url;

// Get token addresses for filtering
const TOKEN_ADDRESSES = TOKENS.map((t) => t.address.toLowerCase());

interface SubgraphVault {
	id: string;
	vaultId: string;
	owner: string;
	token: {
		id: string;
		address: string;
		symbol: string;
		decimals: string;
	};
	balance: string;
	orderbook: {
		id: string;
	};
}

export interface VaultHolding {
	vaultId: string;
	owner: string;
	tokenAddress: string;
	tokenSymbol: string;
	balance: string; // Raw balance as string
	orderbookAddress: string;
}

/**
 * Fetch all vaults with non-zero balances for our tokens
 * Returns vault holdings that can be attributed to their owners
 */
async function fetchVaults(skip: number, tokenAddresses: string[]): Promise<SubgraphVault[]> {
	// Note: We fetch all vaults and filter client-side because:
	// 1. Token entity ID in subgraph may not match token address directly
	// 2. balance_gt filter may not work if balance is stored as Bytes type
	const query = `
		query getVaults($skip: Int!, $first: Int!) {
			vaults(
				skip: $skip
				first: $first
			) {
				id
				vaultId
				owner
				token {
					id
					address
					symbol
					decimals
				}
				balance
				orderbook {
					id
				}
			}
		}
	`;

	const response = await fetch(ORDERBOOK_SUBGRAPH_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query,
			variables: {
				skip,
				first: BATCH_SIZE
			}
		})
	});

	if (!response.ok) {
		throw new Error(`Orderbook subgraph request failed: ${response.status}`);
	}

	const data = await response.json();
	if (data.errors) {
		throw new Error(`GraphQL error: ${data.errors[0]?.message}`);
	}

	const allVaults = data.data?.vaults || [];

	// Filter to only our tokens with non-zero balance (client-side)
	// Note: balance is hex-encoded Rain Float, so we decode it to check
	const tokenAddressSet = new Set(tokenAddresses.map((a) => a.toLowerCase()));
	return allVaults.filter((v: SubgraphVault) => {
		const vaultTokenAddr = (v.token.address || v.token.id).toLowerCase();
		if (!tokenAddressSet.has(vaultTokenAddr)) return false;

		// Decode Float to check for non-zero balance
		const decimals = parseInt(v.token.decimals) || 18;
		const decodedBalance = parseFloatHex(v.balance, decimals);
		return decodedBalance > 0n;
	});
}

/**
 * Fetch all vault holdings for our tokens
 * Groups holdings by owner address
 */
export async function fetchAllVaultHoldings(
	tokenAddresses: string[] = TOKEN_ADDRESSES
): Promise<VaultHolding[]> {
	let skip = 0;
	let hasMore = true;
	const allVaults: VaultHolding[] = [];

	console.log(`[Vaults] Fetching vault holdings for ${tokenAddresses.length} tokens`);
	console.log(`[Vaults] Token addresses: ${tokenAddresses.join(', ')}`);
	console.log(`[Vaults] Subgraph URL: ${ORDERBOOK_SUBGRAPH_URL}`);

	try {
		while (hasMore) {
			const batch = await fetchVaults(skip, tokenAddresses);

			console.log(`[Vaults] Raw batch response:`, JSON.stringify(batch.slice(0, 2), null, 2));

			const holdings: VaultHolding[] = batch.map((v) => {
				// Decode Rain Float hex balance to bigint
				const decimals = parseInt(v.token.decimals) || 18;
				const decodedBalance = parseFloatHex(v.balance, decimals);

				return {
					vaultId: v.vaultId,
					owner: v.owner.toLowerCase(),
					tokenAddress: (v.token.address || v.token.id).toLowerCase(),
					tokenSymbol: v.token.symbol,
					balance: decodedBalance.toString(), // Store as string representation of bigint
					orderbookAddress: v.orderbook.id.toLowerCase()
				};
			});

			allVaults.push(...holdings);

			console.log(`[Vaults] Batch: ${batch.length} vaults`);

			hasMore = batch.length === BATCH_SIZE;
			if (hasMore) skip += batch.length;
		}

		console.log(`[Vaults] Total vault holdings fetched: ${allVaults.length}`);
		if (allVaults.length > 0) {
			console.log(`[Vaults] Sample holding:`, JSON.stringify(allVaults[0], null, 2));
		}
		return allVaults;
	} catch (error) {
		console.error(`[Vaults] Failed to fetch vault holdings: ${error}. Continuing without vault attribution.`);
		return [];
	}
}

/**
 * Group vault holdings by owner and token
 * Returns a map of owner -> tokenAddress -> total balance
 */
export function groupVaultHoldingsByOwner(
	holdings: VaultHolding[]
): Map<string, Map<string, bigint>> {
	const ownerHoldings = new Map<string, Map<string, bigint>>();

	for (const holding of holdings) {
		if (!ownerHoldings.has(holding.owner)) {
			ownerHoldings.set(holding.owner, new Map());
		}

		const ownerTokens = ownerHoldings.get(holding.owner)!;
		const currentBalance = ownerTokens.get(holding.tokenAddress) || 0n;
		ownerTokens.set(holding.tokenAddress, currentBalance + BigInt(holding.balance));
	}

	return ownerHoldings;
}
