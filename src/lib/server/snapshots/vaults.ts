// Query vault holdings from the Rain orderbook subgraph
// Used to attribute orderbook holdings to vault owners

import { networks } from '$lib/config/networks';
import { TOKENS } from '$lib/config/tokens';

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
	const query = `
		query getVaults($skip: Int!, $first: Int!, $tokenAddresses: [String!]!) {
			vaults(
				skip: $skip
				first: $first
				where: {
					token_in: $tokenAddresses
					balance_gt: "0"
				}
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
				first: BATCH_SIZE,
				tokenAddresses
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

	return data.data?.vaults || [];
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

	while (hasMore) {
		const batch = await fetchVaults(skip, tokenAddresses);

		const holdings: VaultHolding[] = batch.map((v) => ({
			vaultId: v.vaultId,
			owner: v.owner.toLowerCase(),
			tokenAddress: (v.token.address || v.token.id).toLowerCase(),
			tokenSymbol: v.token.symbol,
			balance: v.balance,
			orderbookAddress: v.orderbook.id.toLowerCase()
		}));

		allVaults.push(...holdings);

		console.log(`[Vaults] Batch: ${batch.length} vaults`);

		hasMore = batch.length === BATCH_SIZE;
		if (hasMore) skip += batch.length;
	}

	console.log(`[Vaults] Total vault holdings fetched: ${allVaults.length}`);
	return allVaults;
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
