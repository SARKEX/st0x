import type { SgTrade } from '@rainlanguage/orderbook';
import { TOKENS } from '$lib/config/network';
import type { Network } from '$lib/config/network';
import type { OffchainAssetReceiptVault, MetaV1S } from '$lib/types/OffchainAssetReceiptVault';

/**
 * Fetch a single token by ID from the subgraph
 * Much faster than fetching all tokens - use this for individual token pages
 */
export const getSftById = async (
	tokenId: string,
	network: Network
): Promise<OffchainAssetReceiptVault | null> => {
	const subgraphUrl = network.subgraph_url;

	// Validate that the token exists in our config
	const token = TOKENS.find(
		(t) => t.chainId === network.chainId && t.address.toLowerCase() === tokenId.toLowerCase()
	);
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

	try {
		// Query all orderbook subgraph URLs and combine results
		const allTradesPromises = allOrderbookUrls.map(async (url) => {
			try {
				const trades = await fetchAllPaginatedData(
					url,
					tradesQuery,
					{ timestampGt: timestampGt, timestampLt: timestampLt },
					'trades'
				);

				return trades;
			} catch {
				return [];
			}
		});

		// Wait for all queries to complete
		const allTradesResults = await Promise.all(allTradesPromises);

		// Combine all results and remove duplicates based on trade ID
		const allTrades = allTradesResults.flat();
		const uniqueTrades = allTrades.filter(
			(trade, index, self) => index === self.findIndex((t) => t.id === trade.id)
		);

		return uniqueTrades;
	} catch (error) {
		throw new Error(
			`Failed to fetch trades: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
};

// GraphQL fragment for trade fields - shared between queries
const TRADE_FIELDS = `
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
        owner
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
        owner
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
    }`;

/**
 * Fetch ALL trades where the specified address is either:
 * 1. The sender (taker) - market orders
 * 2. The vault owner (maker) - limit order fills
 * Used for cost basis calculation to capture both market and limit order trades.
 */
export const getTradesByUserAllTime = async (
	userAddress: string,
	tokenAddress: string | null,
	network?: Network,
	includeInactive: boolean = true
): Promise<SgTrade[]> => {
	if (!userAddress) {
		return [];
	}

	const allOrderbookUrls: string[] = [];

	if (network?.orderbook_subgraph_url) {
		allOrderbookUrls.push(network.orderbook_subgraph_url);
	}

	if (
		includeInactive &&
		network?.orderbook_subgraph_urls_inactive &&
		network.orderbook_subgraph_urls_inactive.length > 0
	) {
		allOrderbookUrls.push(...network.orderbook_subgraph_urls_inactive);
	}

	if (allOrderbookUrls.length === 0) {
		return [];
	}

	// Query all trades without timestamp filter
	const tradesQuery = `query TradesByUserAllTime($skip: Int = 0, $first: Int = 1000) {
  trades(skip: $skip, first: $first, orderBy: timestamp, orderDirection: desc) {
${TRADE_FIELDS}
  }
}`;

	try {
		const allTradesPromises = allOrderbookUrls.map(async (url) => {
			try {
				return await fetchAllPaginatedData(url, tradesQuery, {}, 'trades');
			} catch {
				return [];
			}
		});

		const allTradesResults = await Promise.all(allTradesPromises);
		const allTrades = allTradesResults.flat();

		// Remove duplicates
		let uniqueTrades = allTrades.filter(
			(trade, index, self) => index === self.findIndex((t) => t.id === trade.id)
		);

		// Filter by user address - include trades where user is either:
		// 1. The sender (taker) - they executed a market order via UI
		// 2. The transaction initiator - they signed a tx (e.g., via aggregator)
		// 3. The vault owner (maker) - their limit order/DCA was filled
		const normalizedUser = userAddress.toLowerCase();
		uniqueTrades = uniqueTrades.filter((trade: SgTrade) => {
			const tradeSender = trade.tradeEvent?.sender?.toLowerCase();
			const txFrom = trade.tradeEvent?.transaction?.from?.toLowerCase();
			const inputVaultOwner = (
				trade.inputVaultBalanceChange?.vault as { owner?: string }
			)?.owner?.toLowerCase();
			const outputVaultOwner = (
				trade.outputVaultBalanceChange?.vault as { owner?: string }
			)?.owner?.toLowerCase();

			return (
				tradeSender === normalizedUser ||
				txFrom === normalizedUser ||
				inputVaultOwner === normalizedUser ||
				outputVaultOwner === normalizedUser
			);
		});

		// Filter by token address if provided
		if (tokenAddress) {
			const normalizedToken = tokenAddress.toLowerCase();
			uniqueTrades = uniqueTrades.filter((trade: SgTrade) => {
				const inputTokenAddr = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
				const outputTokenAddr =
					trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
				return inputTokenAddr === normalizedToken || outputTokenAddr === normalizedToken;
			});
		}

		return uniqueTrades;
	} catch (error) {
		throw new Error(
			`Failed to fetch trades by user: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
};

export async function fetchAllPaginatedData(
	endpoint: string,
	query: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	variables: any,
	itemsKey: string,
	first = 1000
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
	const allItems = [];
	let skip = 0;
	let hasMore = true;
	while (hasMore) {
		// Prepare variables with updated pagination parameters
		const paginatedVariables = { ...variables, skip, first };
		// Fetch a batch of items
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				query,
				variables: paginatedVariables
			})
		});

		if (!response.ok) {
			throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();

		// Check for GraphQL errors
		if (data.errors) {
			throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
		}

		// Extract the items from the response
		const items = data.data[itemsKey] || [];
		allItems.push(...items); // Append items to the result array
		// Check if fewer items are returned than the `first` limit
		if (items.length < first) {
			// All items fetched; exit the loop
			hasMore = false;
		}
		// Increment skip for the next batch
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
