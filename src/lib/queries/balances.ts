import { queryClient } from '$lib/clients/queryClient';

/**
 * Invalidate all dashboard balance queries.
 * Call this after transactions that affect token balances:
 * This is used after wrapping, unwrapping, deposits, sends, and other
 * non-trading wallet activity.
 */
export function invalidateDashboardBalances() {
	// Invalidate all balance-related queries
	queryClient.invalidateQueries({ queryKey: ['walletHoldings'] });
	queryClient.invalidateQueries({ queryKey: ['usdcWalletBalance'] });
	queryClient.invalidateQueries({ queryKey: ['ethWalletBalance'] });
	queryClient.invalidateQueries({ queryKey: ['usdcBalance'] });
	queryClient.invalidateQueries({ queryKey: ['tokenBalance'] });
}
