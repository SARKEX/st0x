import type { SgTrade } from '@rainlanguage/orderbook';
import { TOKENS } from '$lib/config/network';
import type { Network } from '$lib/config/network';
import type { OffchainAssetReceiptVault, MetaV1S } from '$lib/types/OffchainAssetReceiptVault';
import { executeGraphql, fetchAllPaginated } from '$lib/clients/subgraph';

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

    withdraws(first: 1000) {
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
    deposits(first: 1000) {
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

    tokenHolders(first: 1000) {
      address
      balance
    }

    shareTransfers(first: 1000) {
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
    receiptVaultInformations(first: 100, orderBy: timestamp, orderDirection: desc) {
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

	const data = await executeGraphql<{
		offchainAssetReceiptVaults: OffchainAssetReceiptVault[];
	}>(subgraphUrl, query);
	const vaults = data.offchainAssetReceiptVaults ?? [];
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

    withdraws(first: 1000) {
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
    deposits(first: 1000) {
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

    tokenHolders(first: 1000) {
      address
      balance
    }

    shareTransfers(first: 1000) {
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
    receiptVaultInformations(first: 100, orderBy: timestamp, orderDirection: desc) {
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

	const data = await executeGraphql<{
		offchainAssetReceiptVaults: OffchainAssetReceiptVault[];
	}>(subgraphUrl, query);
	return (data.offchainAssetReceiptVaults ?? []) as OffchainAssetReceiptVault[];
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
				const trades = (await fetchAllPaginated(
					url,
					tradesQuery,
					{ timestampGt: timestampGt, timestampLt: timestampLt },
					'trades'
				)) as SgTrade[];

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
 * 2. The transaction initiator - aggregator/relay scenario
 * 3. The vault owner (maker) - limit order fills
 * Used for cost basis calculation to capture both market and limit order trades.
 *
 * Uses 4 targeted GraphQL queries with server-side filtering instead of
 * downloading all trades and filtering in JS, dramatically reducing data transfer.
 */
export const getTradesByUserAllTime = async (
	userAddress: string,
	tokenAddress: string | null,
	network?: Network,
	includeInactive: boolean = true
): Promise<SgTrade[]> => {
	if (!userAddress) return [];

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
	if (allOrderbookUrls.length === 0) return [];

	const normalizedUser = userAddress.toLowerCase();

	// Query 1: Trades where user is the taker (sender)
	const takerQuery = `query TradesByTaker($skip: Int = 0, $first: Int = 1000, $sender: String!) {
  trades(skip: $skip, first: $first, orderBy: timestamp, orderDirection: desc,
    where: { tradeEvent_: { sender: $sender } }
  ) {
${TRADE_FIELDS}
  }
}`;

	// Query 2: Trades where user is the tx initiator (aggregator/relay scenario)
	const txFromQuery = `query TradesByTxFrom($skip: Int = 0, $first: Int = 1000, $from: String!) {
  trades(skip: $skip, first: $first, orderBy: timestamp, orderDirection: desc,
    where: { tradeEvent_: { transaction_: { from: $from } } }
  ) {
${TRADE_FIELDS}
  }
}`;

	// Query 3: Trades where user is the maker (vault owner — input side)
	const makerInputQuery = `query TradesByMakerInput($skip: Int = 0, $first: Int = 1000, $owner: String!) {
  trades(skip: $skip, first: $first, orderBy: timestamp, orderDirection: desc,
    where: { inputVaultBalanceChange_: { vault_: { owner: $owner } } }
  ) {
${TRADE_FIELDS}
  }
}`;

	// Query 4: Trades where user is the maker (vault owner — output side)
	const makerOutputQuery = `query TradesByMakerOutput($skip: Int = 0, $first: Int = 1000, $owner: String!) {
  trades(skip: $skip, first: $first, orderBy: timestamp, orderDirection: desc,
    where: { outputVaultBalanceChange_: { vault_: { owner: $owner } } }
  ) {
${TRADE_FIELDS}
  }
}`;

	try {
		const allTradesPromises = allOrderbookUrls.flatMap((url) => [
			(fetchAllPaginated(url, takerQuery, { sender: normalizedUser }, 'trades') as Promise<SgTrade[]>)
				.catch(() => [] as SgTrade[]),
			(fetchAllPaginated(url, txFromQuery, { from: normalizedUser }, 'trades') as Promise<SgTrade[]>)
				.catch(() => [] as SgTrade[]),
			(fetchAllPaginated(url, makerInputQuery, { owner: normalizedUser }, 'trades') as Promise<SgTrade[]>)
				.catch(() => [] as SgTrade[]),
			(fetchAllPaginated(url, makerOutputQuery, { owner: normalizedUser }, 'trades') as Promise<SgTrade[]>)
				.catch(() => [] as SgTrade[])
		]);

		const allTradesResults = await Promise.all(allTradesPromises);
		let allTrades = allTradesResults.flat();

		// Remove duplicates (a trade may appear in both taker and maker results)
		const seen = new Set<string>();
		allTrades = allTrades.filter((trade) => {
			if (seen.has(trade.id)) return false;
			seen.add(trade.id);
			return true;
		});

		// Filter by token address if provided
		if (tokenAddress) {
			const normalizedToken = tokenAddress.toLowerCase();
			allTrades = allTrades.filter((trade: SgTrade) => {
				const inputTokenAddr = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
				const outputTokenAddr = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
				return inputTokenAddr === normalizedToken || outputTokenAddr === normalizedToken;
			});
		}

		return allTrades;
	} catch (error) {
		throw new Error(
			`Failed to fetch trades by user: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
};

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

	const data = await executeGraphql<{ metaV1S: MetaV1S[] }>(subgraphUrl, query);
	return data.metaV1S as MetaV1S[];
};
