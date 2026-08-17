import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import {
	calculateAllCostBases,
	type CostBasisData,
	type CostBasisTrade
} from '$lib/utils/costBasis';
import { PAYMENT_TOKENS_BY_NETWORK } from '$lib/config/tokens';
import { apiGetTradesByAddress, apiGetTakerTrades, type ApiTradeByAddress } from '$lib/api/st0xApi';

const TRADE_HISTORY_PAGE_SIZE = 500;

export type CostBasisPayload = {
	costBasis: Map<string, CostBasisData>;
	takerTrades: ApiTradeByAddress[];
};

export type UserTradeHistory = {
	costBasisTrades: CostBasisTrade[];
	takerTrades: ApiTradeByAddress[];
};

/**
 * Ensure an amount string contains a decimal point so toDecimal()
 * treats it as a pre-formatted decimal rather than a wei-scaled bigint.
 */
function ensureDecimal(amount: string): string {
	return amount.includes('.') ? amount : amount + '.0';
}

/**
 * Convert a maker trade (from apiGetTradesByAddress) to a CostBasisTrade.
 * Input/output are from the ORDER's perspective — the user is the vault owner (maker).
 */
function makerTradeToCostBasis(trade: ApiTradeByAddress, userAddress: string): CostBasisTrade {
	return {
		timestamp: trade.timestamp,
		inputVaultBalanceChange: {
			amount: ensureDecimal(trade.inputAmount),
			vault: {
				token: { address: trade.inputToken.address, decimals: 0 },
				owner: userAddress
			}
		},
		outputVaultBalanceChange: {
			amount: ensureDecimal(trade.outputAmount),
			vault: {
				token: { address: trade.outputToken.address, decimals: 0 },
				owner: userAddress
			}
		}
	};
}

/**
 * Convert a taker trade to a CostBasisTrade.
 * Input/output are still from the ORDER's perspective, so the taker gives inputToken
 * and receives outputToken.
 */
function takerTradeToCostBasis(trade: ApiTradeByAddress, userAddress: string): CostBasisTrade {
	return {
		timestamp: trade.timestamp,
		inputVaultBalanceChange: {
			amount: ensureDecimal(trade.inputAmount),
			vault: {
				token: { address: trade.inputToken.address, decimals: 0 }
			}
		},
		outputVaultBalanceChange: {
			amount: ensureDecimal(trade.outputAmount),
			vault: {
				token: { address: trade.outputToken.address, decimals: 0 }
			}
		},
		tradeEvent: { sender: userAddress }
	};
}

/**
 * Fetch all trades for a user from the REST API (paginated).
 * Combines maker trades (user's orders were filled) and taker trades (user executed market orders).
 */
export async function fetchAllUserTrades(userAddress: string): Promise<UserTradeHistory> {
	const costBasisTrades: CostBasisTrade[] = [];
	const takerTrades: ApiTradeByAddress[] = [];
	const seen = new Set<string>();

	// Fetch all maker trades (paginated)
	let makerPage = 1;
	let makerHasMore = true;
	while (makerHasMore) {
		const response = await apiGetTradesByAddress(userAddress, {
			page: makerPage,
			pageSize: TRADE_HISTORY_PAGE_SIZE
		});

		for (const trade of response.trades ?? []) {
			const key = `${trade.txHash}:${trade.orderHash ?? ''}`;
			if (seen.has(key)) continue;
			seen.add(key);
			costBasisTrades.push(makerTradeToCostBasis(trade, userAddress));
		}

		makerHasMore = response.pagination.hasMore;
		makerPage++;
	}

	// Fetch all taker trades (paginated)
	let takerPage = 1;
	let takerHasMore = true;
	while (takerHasMore) {
		const response = await apiGetTakerTrades(userAddress, {
			page: takerPage,
			pageSize: TRADE_HISTORY_PAGE_SIZE
		});

		for (const trade of response.trades ?? []) {
			if (takerPage === 1) takerTrades.push(trade);
			const key = `${trade.txHash}:${trade.orderHash ?? ''}`;
			if (seen.has(key)) continue;
			seen.add(key);
			costBasisTrades.push(takerTradeToCostBasis(trade, userAddress));
		}

		takerHasMore = response.pagination.hasMore;
		takerPage++;
	}

	return { costBasisTrades, takerTrades };
}

/**
 * Query for calculating cost basis from all-time trade history.
 * Fetches both maker fills and taker market orders from the REST API.
 * Fetches once and refreshes only when a successful market order invalidates it.
 */
export function createCostBasisQuery(network: Network | null, userAddress: string | null) {
	return createQuery<CostBasisPayload>({
		queryKey: ['costBasis', network?.id, userAddress],
		enabled: Boolean(network && userAddress),
		staleTime: Infinity,
		refetchInterval: false, // No polling - fetch once on mount
		refetchOnWindowFocus: false,
		// fetchJson already retries transient failures. Replaying this multi-page query
		// from page one would duplicate every completed request and can create a retry storm.
		retry: false,
		queryFn: async () => {
			if (!network || !userAddress) {
				return { costBasis: new Map(), takerTrades: [] };
			}

			// Fetch all trades for the user via REST API
			const { costBasisTrades, takerTrades } = await fetchAllUserTrades(userAddress);

			// Get payment token addresses for this network
			const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[network.chainId] ?? [];
			const paymentTokenAddresses = new Set(paymentTokens.map((t) => t.address.toLowerCase()));

			// Calculate cost basis for all traded tokens
			return {
				costBasis: calculateAllCostBases(costBasisTrades, paymentTokenAddresses, userAddress),
				takerTrades
			};
		}
	});
}
