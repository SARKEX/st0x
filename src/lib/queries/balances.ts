import { queryClient } from '$lib/clients/queryClient';

/**
 * Invalidate all dashboard balance queries.
 * Call this after transactions that affect token balances:
 * - Market orders (buy/sell)
 * - Limit/DCA order deployments
 * - Vault withdrawals
 */
export function invalidateDashboardBalances() {
	// Invalidate all balance-related queries
	queryClient.invalidateQueries({ queryKey: ['walletHoldings'] });
	queryClient.invalidateQueries({ queryKey: ['paymentTokenWalletBalance'] });
	queryClient.invalidateQueries({ queryKey: ['nativeWalletBalance'] });
}

/** Refresh balances and trade-derived data after a confirmed market execution. */
export function invalidateExecutedTradeQueries() {
	invalidateDashboardBalances();
	queryClient.invalidateQueries({ queryKey: ['tokenTradeActivity'] });
	queryClient.invalidateQueries({ queryKey: ['takerTrades'] });
	queryClient.invalidateQueries({ queryKey: ['batchTrades'] });
	queryClient.invalidateQueries({ queryKey: ['costBasis'] });
}
