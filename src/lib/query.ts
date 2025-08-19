import type { SgTrade } from '@rainlanguage/orderbook';
import { TOKENS } from './network';
import { currentNetwork } from './stores';
import axios from 'axios';
import { get } from 'svelte/store';
import type { Network } from './network';

// TODO: Add type for the response
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getSfts = async (): Promise<any> => {
	// Get current network value from store
	const network = get(currentNetwork);

	// Filter tokens by current network's chain ID
	const networkTokens = TOKENS.filter((token) => token.chainId === network.chainId);

	// Use current network's subgraph URL
	const subgraphUrl = network.subgraph_url;

	const query = `
    {
 offchainAssetReceiptVaults(where: {
 id_in: [${networkTokens.map((s) => `"${s.address.toLowerCase()}"`).join(',')}]
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
    activeAuthorizer {
      address
      rolesGranted(orderBy: timestamp, orderDirection: desc) {
        role {
          roleName
        }
        sender {
          address
        }
        account {
          address
        }
        timestamp
        transaction {
          id
        }
      }
      roleHolders {
        role {
          roleName
          roleHash
        }
        account {
          address
        }
      }
      roles(orderBy: roleName) {
        roleName
        roleHolders {
          account {
            address
          }
        }
        roleHash
      }
      roleRevokes {
        role {
          roleName
        }
        sender {
          address
        }
        account {
          address
        }
        timestamp
        transaction {
          id
        }
      }
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
    shareHolders {
      address
    }
    
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
    receiptBalances {
      receipt {
        shares
        id
        receiptId
        balances {
          valueExact
          value
          account {
            address
          }
        }
          deposits {
          amount
          receipt {
            receiptId
          }
          timestamp
        }
        receiptInformations(orderDirection: desc, orderBy: timestamp) {
          information
          id
          transaction {
            blockNumber
            id
          }
          timestamp
          emitter {
            address
          }
          receipt {
            deposits {
              amount
            }
          }
        }
      }
    }
    certifications(orderBy: timestamp, orderDirection: desc) {
      timestamp
      id
      certifier {
        address
      }
      certifiedUntil
      totalShares
      transaction {
        id
        blockNumber
      }
      data
      information
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

	return json.data.offchainAssetReceiptVaults;
};

export const getTrades = async (
	timestampGt: number,
	timestampLt: number,
	network?: Network
): Promise<SgTrade[]> => {
	// Validate input parameters
	if (typeof timestampGt !== 'number' || typeof timestampLt !== 'number') {
		throw new Error('Invalid timestamp parameters: timestampGt and timestampLt must be numbers');
	}

	if (timestampGt >= timestampLt) {
		throw new Error('Invalid timestamp range: timestampGt must be less than timestampLt');
	}

	// Collect all orderbook subgraph URLs (active + inactive)
	const allOrderbookUrls: string[] = [];

	// Add active URL if it exists
	if (network?.orderbook_subgraph_url) {
		allOrderbookUrls.push(network.orderbook_subgraph_url);
	}

	// Add inactive URLs if they exist
	if (
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
        { timestamp_gt: $timestampGt }
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
		const response = await axios.post(endpoint, {
			query,
			variables: paginatedVariables
		});

		// Check for GraphQL errors
		if (response.data.errors) {
			throw new Error(`GraphQL errors: ${JSON.stringify(response.data.errors)}`);
		}

		// Extract the items from the response
		const items = response.data.data[itemsKey] || [];
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
