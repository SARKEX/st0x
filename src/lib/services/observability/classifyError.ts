/**
 * Shared error → `ErrorClass` mapper for trade-funnel events
 * (OBS-07/OBS-09 Plan 02-03).
 *
 * Originally inlined at three call sites (MarketOrder, LimitOrder, DcaOrder)
 * with the "extract to shared module" threshold note explicit in MarketOrder.
 * Now centralised here so the `ErrorClass` taxonomy in `tradeEvents.ts` has
 * a single classifier of record.
 *
 * `scope: 'market'` recognises the additional taxonomy a market-order takes
 * can hit (slippage / no_liquidity / stale_oracle / market_closed).
 * `scope: 'deploy'` (default) keeps to the four classes a limit / DCA deploy
 * can hit (user_rejected / insufficient_balance / rpc_error / unknown).
 */

import type { ErrorClass } from './tradeEvents';

export type ClassifyScope = 'market' | 'deploy';

export function classifyError(err: unknown, scope: ClassifyScope = 'deploy'): ErrorClass {
	const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();

	if (scope === 'market') {
		if (msg.includes('slippage')) return 'slippage_exceeded';
		if (msg.includes('liquidity') || msg.includes('no_walk_fills') || msg.includes('no_quotes'))
			return 'no_liquidity';
		if (msg.includes('stale') || msg.includes('oracle')) return 'stale_oracle';
		if (msg.includes('market') && msg.includes('closed')) return 'market_closed';
	}

	if (msg.includes('insufficient') || msg.includes('balance')) return 'insufficient_balance';
	if (msg.includes('user reject') || msg.includes('user denied') || msg.includes('rejected'))
		return 'user_rejected';
	if (msg.includes('rpc') || msg.includes('network')) return 'rpc_error';
	return 'unknown';
}
