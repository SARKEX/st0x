import { queryClient } from '$lib/clients/queryClient';

/**
 * Invalidate all dashboard balance queries.
 * Call this after transactions that affect token balances:
 * - Market orders (buy/sell)
 * - Limit/DCA order deployments
 * - Vault withdrawals
 */
export function invalidateDashboardBalances() {
	console.log('[balances] Invalidating dashboard balance queries...');

	// Invalidate all balance-related queries
	queryClient.invalidateQueries({ queryKey: ['walletHoldings'] });
	queryClient.invalidateQueries({ queryKey: ['usdcWalletBalance'] });
	queryClient.invalidateQueries({ queryKey: ['ethWalletBalance'] });
}
