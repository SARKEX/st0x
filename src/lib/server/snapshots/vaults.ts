// Query vault holdings from the Rain orderbook subgraph
// Used to attribute orderbook holdings to vault owners

import type { Network } from '$lib/config/networks';
import { onTokenCatalogChange } from '$lib/config/tokens';
import { parseFloatHex } from '$lib/utils/tokenMath';

const BATCH_SIZE = 1000;

// Get token addresses for filtering
const TOKEN_ADDRESSES: string[] = [];

onTokenCatalogChange((tokens) => {
	TOKEN_ADDRESSES.splice(
		0,
		TOKEN_ADDRESSES.length,
		...tokens.map((token) => token.address.toLowerCase())
	);
});

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
 * @param blockNumber - If provided, queries vault state at this specific block
 */
async function fetchVaults(
	subgraphUrl: string,
	skip: number,
	tokenAddresses: string[],
	blockNumber?: number
): Promise<SubgraphVault[]> {
	// Note: We fetch all vaults and filter client-side because:
	// 1. Token entity ID in subgraph may not match token address directly
	// 2. balance_gt filter may not work if balance is stored as Bytes type
	const query = blockNumber
		? `
		query getVaults($skip: Int!, $first: Int!, $blockNumber: Int!) {
			vaults(
				skip: $skip
				first: $first
				block: { number: $blockNumber }
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
	`
		: `
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

	const variables: Record<string, number> = {
		skip,
		first: BATCH_SIZE
	};
	if (blockNumber) {
		variables.blockNumber = blockNumber;
	}

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query,
			variables
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
 * Fetch all vault holdings from a single orderbook subgraph URL.
 */
async function fetchAllVaultHoldingsFromSubgraph(
	subgraphUrl: string,
	tokenAddresses: string[],
	blockNumber?: number
): Promise<VaultHolding[]> {
	let skip = 0;
	let hasMore = true;
	const holdings: VaultHolding[] = [];

	while (hasMore) {
		const batch = await fetchVaults(subgraphUrl, skip, tokenAddresses, blockNumber);
		const mapped: VaultHolding[] = batch.map((v) => {
			// Decode Rain Float hex balance to bigint
			const decimals = parseInt(v.token.decimals) || 18;
			const decodedBalance = parseFloatHex(v.balance, decimals);

			return {
				vaultId: v.vaultId,
				owner: v.owner.toLowerCase(),
				tokenAddress: (v.token.address || v.token.id).toLowerCase(),
				tokenSymbol: v.token.symbol,
				balance: decodedBalance.toString(),
				orderbookAddress: v.orderbook.id.toLowerCase()
			};
		});

		holdings.push(...mapped);
		hasMore = batch.length === BATCH_SIZE;
		if (hasMore) skip += batch.length;
	}

	return holdings;
}

/**
 * Fetch all vault holdings for our tokens
 * Groups holdings by owner address
 * @param blockNumber - If provided, queries vault state at this specific block
 */
export async function fetchAllVaultHoldings(
	tokenAddresses: string[],
	blockNumber: number | undefined,
	network: Network
): Promise<VaultHolding[]> {
	const orderbookSubgraphUrls = [
		network.orderbook_subgraph_url,
		...network.orderbook_subgraph_urls_inactive
	].filter(Boolean);
	const deduped = new Map<string, VaultHolding>();

	console.log(
		`[Vaults] Fetching vault holdings for ${tokenAddresses.length} tokens${
			blockNumber ? ` at block ${blockNumber}` : ''
		} from ${orderbookSubgraphUrls.length} orderbook subgraph(s)`
	);
	console.log(`[Vaults] Token addresses: ${tokenAddresses.join(', ')}`);
	console.log(`[Vaults] Subgraph URLs: ${orderbookSubgraphUrls.join(', ')}`);

	try {
		const results = await Promise.all(
			orderbookSubgraphUrls.map(async (url, i) => {
				try {
					const holdings = await fetchAllVaultHoldingsFromSubgraph(
						url,
						tokenAddresses,
						blockNumber
					);
					console.log(
						`[Vaults] Subgraph ${i + 1}/${orderbookSubgraphUrls.length}: ${
							holdings.length
						} vault holdings`
					);
					return holdings;
				} catch (error) {
					console.warn(`[Vaults] Subgraph ${i + 1} failed (${url}):`, error);
					return [];
				}
			})
		);

		// Deduplicate across subgraphs.
		// If both current and inactive subgraphs contain the same vault, keep the first (current URL order).
		for (const holdings of results) {
			for (const holding of holdings) {
				const key = `${holding.orderbookAddress}:${holding.vaultId}:${holding.tokenAddress}:${holding.owner}`;
				if (!deduped.has(key)) {
					deduped.set(key, holding);
				}
			}
		}

		const allVaults = Array.from(deduped.values());
		console.log(`[Vaults] Total vault holdings fetched (deduped): ${allVaults.length}`);
		if (allVaults.length > 0) {
			console.log(`[Vaults] Sample holding:`, JSON.stringify(allVaults[0], null, 2));
		}
		return allVaults;
	} catch (error) {
		console.error(
			`[Vaults] Failed to fetch vault holdings: ${error}. Continuing without vault attribution.`
		);
		return [];
	}
}
