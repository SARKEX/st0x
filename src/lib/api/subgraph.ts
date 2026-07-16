import type { SgTrade } from '@rainlanguage/raindex';
import { TOKENS } from '$lib/config/network';
import { getTokenByAnyAddress } from '$lib/config/tokens';
import type { Network } from '$lib/config/network';
import type { OffchainAssetReceiptVault, MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import { logQueryFailure, errorMessage } from '$lib/utils/monitoring';

/**
 * Fetch a single token by ID from the subgraph
 * Much faster than fetching all tokens - use this for individual token pages
 */
export const getSftById = async (
	tokenId: string,
	network: Network
): Promise<OffchainAssetReceiptVault | null> => {
	const subgraphUrl = network.subgraph_url;

	// Validate that the token exists in our config.
	// DRIFT-01: getTokenByAnyAddress matches wrapped/unwrapped/legacy variants.
	const tokenMatch = getTokenByAnyAddress(tokenId);
	const token = tokenMatch?.chainId === network.chainId ? tokenMatch : null;
	if (!token) {
		return null;
	}

	const query = `
    {
 offchainAssetReceiptVaults(where: {
 wrappedTokenContractAddress: "${tokenId.toLowerCase()}"
 }) {

    withdraws {
      id
       emitter {
        address
      }
      transaction {
        id
      }

      receipt {
        id
        receiptId
        receiptInformations {
        payload
          schema
          information
            payload
            schema
          emitter {
            address
          }
        }
      }
      amount
      caller {
        address
      }
      timestamp
    }
    deposits {
      id
       emitter {
        address
      }
      transaction {
        id
      }
      receipt {
        id
        receiptId
        receiptInformations {
          payload
          schema
          information
          emitter {
            address
          }
        }
      }
      amount
      caller {
        address
      }
      timestamp
    }
    id
    totalShares
    address
    deployer
    admin
    name
    symbol
    deployTimestamp
    receiptContractAddress

    tokenHolders {
      address
      balance
    }

    shareTransfers {
      id
      timestamp
      from {
        address
      }
      to {
        address
      }
      value
    }
    receiptVaultInformations(orderBy: timestamp, orderDirection: desc) {
      information
      id
      timestamp
      caller {
        address
      }
      transaction {
        blockNumber
      }
    }
  }
          }
    `;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query })
	});

	const json = await response.json();
	const vaults = (json.data.offchainAssetReceiptVaults ?? []) as OffchainAssetReceiptVault[];
	return vaults.length > 0 ? vaults[0] : null;
};

export const getSfts = async (network: Network): Promise<OffchainAssetReceiptVault[]> => {
	const networkTokens = TOKENS.filter((token) => token.chainId === network.chainId);

	const subgraphUrl = network.subgraph_url;

	const query = `
    {
 offchainAssetReceiptVaults(where: {
 wrappedTokenContractAddress_in: [${networkTokens
		.map((s) => `"${s.address.toLowerCase()}"`)
		.join(',')}]
 }) {

    withdraws {
      id
       emitter {
        address
      }
      transaction {
        id
      }
      
      receipt {
        id
        receiptId
        receiptInformations {
        payload
          schema
          information
            payload
            schema
          emitter {
            address
          }
        }
      }
      amount
      caller {
        address
      }
      timestamp
    }
    deposits {
      id
       emitter {
        address
      }
      transaction {
        id
      }
      receipt {
        id
        receiptId
        receiptInformations {
          payload
          schema
          information
          emitter {
            address
          }
        }
      }
      amount
      caller {
        address
      }
      timestamp
    }
    id
    totalShares
    address
    deployer
    admin
    name
    symbol
    deployTimestamp
    receiptContractAddress

    tokenHolders {
      address
      balance
    }

    shareTransfers {
      id
      timestamp
      from {
        address
      }
      to {
        address
      }
      value
    }
    receiptVaultInformations(orderBy: timestamp, orderDirection: desc) {
      information
      id
      timestamp
      caller {
        address
      }
      transaction {
        blockNumber
      }
    }
  }
          }
    `;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query })
	});

	const json = await response.json();
	return (json.data.offchainAssetReceiptVaults ?? []) as OffchainAssetReceiptVault[];
};

export const getTrades = async (
	timestampGt: number,
	timestampLt: number,
	network?: Network,
	includeInactive: boolean = false
): Promise<SgTrade[]> => {
	// Validate input parameters
	if (typeof timestampGt !== 'number' || typeof timestampLt !== 'number') {
		throw new Error('Invalid timestamp parameters: timestampGt and timestampLt must be numbers');
	}

	if (timestampGt >= timestampLt) {
		throw new Error('Invalid timestamp range: timestampGt must be less than timestampLt');
	}

	// Collect orderbook subgraph URLs (active only by default, + inactive when requested)
	const allOrderbookUrls: string[] = [];

	// Add active URL if it exists
	if (network?.orderbook_subgraph_url) {
		allOrderbookUrls.push(network.orderbook_subgraph_url);
	}

	// Add inactive URLs only when explicitly requested
	if (
		includeInactive &&
		network?.orderbook_subgraph_urls_inactive &&
		network.orderbook_subgraph_urls_inactive.length > 0
	) {
		allOrderbookUrls.push(...network.orderbook_subgraph_urls_inactive);
	}

	// If no URLs available, return empty array
	if (allOrderbookUrls.length === 0) {
		return [];
	}

	const tradesQuery = `query Trades($skip: Int = 0, $first: Int = 1000, $timestampGt: Int!, $timestampLt: Int!) {
  trades(
    skip: $skip
    first: $first
    orderBy: timestamp
    orderDirection: desc
    where: {
      and: [
        { timestamp_gt: $timestampGt },
        { timestamp_lt: $timestampLt }
      ]
    }
  ){
    id
    tradeEvent{
      transaction{
        id
        from
        blockNumber
        timestamp
      }
      sender
    }
    outputVaultBalanceChange {
      id
      __typename
      amount
      newVaultBalance
      oldVaultBalance
      vault {
        id
        vaultId
        token {
          id
          address
          name
          symbol
          decimals
        }
      }
      timestamp
      transaction{
        id
        from
        blockNumber
        timestamp
      }
      orderbook{
        id
      }
    }
    order{
      id
      orderHash
    }
    inputVaultBalanceChange {
      id
      __typename
      amount
      newVaultBalance
      oldVaultBalance
      vault {
        id
        vaultId
        token {
          id
          address
          name
          symbol
          decimals
        }
      }
      timestamp
      transaction{
        id
        from
        blockNumber
        timestamp
      }
      orderbook{
        id
      }
    }
    timestamp
    orderbook{
      id
    }
    
  }
}`;

	const allTradesResults = await Promise.all(
		allOrderbookUrls.map(async (url) => {
			try {
				return await fetchAllPaginatedData(
					url,
					tradesQuery,
					{ timestampGt, timestampLt },
					'trades'
				);
			} catch {
				return [];
			}
		})
	);

	const allTrades = allTradesResults.flat();
	const seenIds = new Set<string>();
	return allTrades.filter((trade) => {
		if (seenIds.has(trade.id)) return false;
		seenIds.add(trade.id);
		return true;
	});
};

// A GraphQL error typically indicates a permanent problem with the query (bad
// fields, unknown arguments, etc.) so retrying won't help. Network/HTTP errors
// are more often transient (rate limits, connection blips) and are worth retrying.
class GraphQLError extends Error {}

function fetchPageWithRetry(
	endpoint: string,
	body: string,
	maxAttempts: number,
	itemsKey?: string
): Promise<unknown> {
	const attempt = async (n: number): Promise<unknown> => {
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body
			});

			if (!response.ok) {
				throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();
			if (data.errors) {
				throw new GraphQLError(`GraphQL errors: ${JSON.stringify(data.errors)}`);
			}
			return data.data;
		} catch (error) {
			// Permanent errors: don't retry
			if (error instanceof GraphQLError) {
				logQueryFailure({
					kind: 'subgraph_page_failed',
					endpoint,
					itemsKey,
					attempt: n,
					maxAttempts,
					permanent: true,
					error: errorMessage(error)
				});
				throw error;
			}
			// Out of retry budget
			if (n >= maxAttempts) {
				logQueryFailure({
					kind: 'subgraph_page_failed',
					endpoint,
					itemsKey,
					attempt: n,
					maxAttempts,
					permanent: false,
					error: errorMessage(error)
				});
				throw error;
			}
			logQueryFailure({
				kind: 'subgraph_page_retry',
				endpoint,
				itemsKey,
				attempt: n,
				maxAttempts,
				error: errorMessage(error)
			});
			// Exponential backoff with jitter: ~400ms, ~900ms, ~1800ms, ...
			const base = 400 * 2 ** (n - 1);
			const jitter = Math.random() * 200;
			await new Promise((resolve) => setTimeout(resolve, base + jitter));
			return attempt(n + 1);
		}
	};
	return attempt(1);
}

export async function fetchAllPaginatedData(
	endpoint: string,
	query: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	variables: any,
	itemsKey: string,
	first = 1000,
	options: { maxAttempts?: number } = {}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
	const maxAttempts = options.maxAttempts ?? 3;
	const allItems = [];
	let skip = 0;
	let hasMore = true;
	while (hasMore) {
		const paginatedVariables = { ...variables, skip, first };
		const body = JSON.stringify({ query, variables: paginatedVariables });

		let items: unknown[];
		try {
			const data = (await fetchPageWithRetry(endpoint, body, maxAttempts, itemsKey)) as Record<
				string,
				unknown[]
			>;
			items = data[itemsKey] || [];
		} catch (error) {
			// Pagination page failed even after retries (upstream rate limit, outage, etc.).
			// Returning what we have is strictly better than discarding thousands of
			// already-fetched items — callers can still render partial results and
			// a background refetch will pick up the tail on the next poll.
			logQueryFailure({
				kind: 'subgraph_pagination_interrupted',
				endpoint,
				itemsKey,
				skip,
				itemsSoFar: allItems.length,
				error: errorMessage(error)
			});
			return allItems;
		}

		allItems.push(...items);
		if (items.length < first) {
			hasMore = false;
		}
		skip += first;
	}
	return allItems;
}

export const getSftMetadata = async (
	vaultAddress: string,
	subgraphUrl: string
): Promise<MetaV1S[]> => {
	const query = `
    {
      metaV1S(
        where: { subject: "0x000000000000000000000000${vaultAddress.slice(2)}" },
        orderBy: transaction__timestamp,
        orderDirection: desc
      ) {
        id
        meta
        sender
        subject
        metaHash
      }
    }
  `;

	const response = await fetch(subgraphUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ query })
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch SFT metadata: ${response.status}`);
	}

	const json = await response.json();
	return json.data?.metaV1S as MetaV1S[];
};
