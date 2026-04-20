import { createQuery } from '@tanstack/svelte-query';
import type { Network } from '$lib/config/network';
import { calculateAllCostBases, type CostBasisData, type CostBasisTrade } from '$lib/utils/costBasis';
import { PAYMENT_TOKENS_BY_NETWORK } from '$lib/config/tokens';
import { apiGetTradesByAddress, apiGetTakerTrades, type ApiTradeByAddress } from '$lib/api/st0xApi';

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
 * Fetch all trades for a user from the REST API (paginated).
 * Combines maker trades (user's orders were filled) and taker trades (user executed market orders).
 */
async function fetchAllUserTrades(userAddress: string): Promise<CostBasisTrade[]> {
	const PAGE_SIZE = 50;
	const MAX_PAGES = 100; // Safety cap: 5,000 trades max
	const trades: CostBasisTrade[] = [];
	const seen = new Set<string>();

	// Fetch all maker trades (paginated)
	let makerPage = 1;
	let makerHasMore = true;
	while (makerHasMore && makerPage <= MAX_PAGES) {
		const response = await apiGetTradesByAddress(userAddress, {
			page: makerPage,
			pageSize: PAGE_SIZE
		});

		for (const trade of response.trades) {
			const key = `${trade.txHash}:${trade.orderHash ?? ''}`;
			if (seen.has(key)) continue;
			seen.add(key);
			trades.push(makerTradeToCostBasis(trade, userAddress));
		}

		makerHasMore = response.pagination.hasMore;
		makerPage++;
	}

	// Fetch all taker trades (paginated)
	let takerPage = 1;
	let takerHasMore = true;
	while (takerHasMore && takerPage <= MAX_PAGES) {
		const response = await apiGetTakerTrades(userAddress, {
			page: takerPage,
			pageSize: PAGE_SIZE
		});

		for (const marketOrder of response.marketOrders) {
			for (const entry of marketOrder.trades) {
				const key = `${marketOrder.txHash}:${entry.orderHash}`;
				if (seen.has(key)) continue;
				seen.add(key);

				trades.push({
					timestamp: marketOrder.timestamp,
					inputVaultBalanceChange: {
						amount: ensureDecimal(entry.result.inputAmount),
						vault: {
							token: { address: entry.request.inputToken, decimals: 0 }
						}
					},
					outputVaultBalanceChange: {
						amount: ensureDecimal(entry.result.outputAmount),
						vault: {
							token: { address: entry.request.outputToken, decimals: 0 }
						}
					},
					tradeEvent: { sender: userAddress }
				});
			}
		}

		takerHasMore = response.pagination.hasMore;
		takerPage++;
	}

	return trades;
}

/**
 * Query for calculating cost basis from all-time trade history.
 * Fetches both maker fills and taker market orders from the REST API.
 * One-shot query: fetches once on mount, refreshes on window focus only.
 */
export function createCostBasisQuery(network: Network | null, userAddress: string | null) {
	return createQuery<Map<string, CostBasisData>>({
		queryKey: ['costBasis', network?.id, userAddress],
		enabled: Boolean(network && userAddress),
		staleTime: 600_000, // 10 minutes - only refetch when stale
		refetchInterval: false, // No polling - fetch once on mount
		refetchOnWindowFocus: true, // Refresh when user returns to tab (only if stale)
		queryFn: async () => {
			if (!network || !userAddress) {
				return new Map();
			}

			// Fetch all trades for the user via REST API
			const trades = await fetchAllUserTrades(userAddress);

			// Get payment token addresses for this network
			const paymentTokens = PAYMENT_TOKENS_BY_NETWORK[network.chainId] ?? [];
			const paymentTokenAddresses = new Set(paymentTokens.map((t) => t.address.toLowerCase()));

			// Calculate cost basis for all traded tokens
			return calculateAllCostBases(trades, paymentTokenAddresses, userAddress);
		}
	});
}
