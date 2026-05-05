/**
 * RPC attempt + chain-exhaustion metrics for OBS-04 / D-09.
 *
 * Emits structured pino lines for every attempt:
 *  - debug `rpc_attempt` on success
 *  - warn `rpc_failed` on per-attempt failure
 *  - error `rpc_chain_exhausted` when the entire fallback chain fails for a single call
 *
 * Counts are derived via Vercel Logs queries (no separate metrics store). Slack alert
 * fires every chain-exhausted occurrence (no rollup/dedupe in Phase 1 per D-09).
 *
 * RPC-tier metric — distinct from subgraph/HTTP failures in src/lib/utils/monitoring.ts.
 * Module never throws back to caller (analog convention from monitoring.ts and auditLog.ts).
 *
 * Phase 1 visibility-only fence (Pitfall 3 / REL-01): this module records visibility
 * around the existing single-attempt-per-RPC fallback chain. It does NOT add retry,
 * backoff, jitter, or alter empty-result handling — those are Phase 3 territory
 * (REL-01 in generator.ts:callRpc; REL-02 in accessCodes.ts:verifyWalletSignature).
 */

import { getLogger, getRequestContext } from '$lib/server/logger';
import { notifyChainExhausted } from '$lib/server/alerts';

interface RpcAttempt {
	rpc_url: string;
	fn: string;
	ok: boolean;
	status_or_error: string;
	duration_ms: number;
}

export function recordRpcAttempt(attempt: RpcAttempt): void {
	try {
		if (attempt.ok) {
			getLogger().debug({ event: 'rpc_attempt', ...attempt }, 'rpc ok');
		} else {
			getLogger().warn({ event: 'rpc_failed', ...attempt }, 'rpc failed');
		}
	} catch (err) {
		// Logging never throws back into caller (CONVENTIONS.md error-handling pattern).
		console.error('[rpcMetrics] failed to record attempt:', err);
	}
}

export interface ChainExhaustedDetails {
	fn: string;
	attempts: Array<Pick<RpcAttempt, 'rpc_url' | 'status_or_error'>>;
}

export async function reportChainExhausted(details: ChainExhaustedDetails): Promise<void> {
	const ctx = getRequestContext();
	const request_id = ctx?.request_id ?? '<no-request>';

	try {
		getLogger().error(
			{ event: 'rpc_chain_exhausted', ...details, request_id },
			'all RPCs failed for one call'
		);
	} catch (err) {
		console.error('[rpcMetrics] failed to log chain-exhausted:', err);
	}

	// Best-effort Slack delivery — fire-and-forget with 3s timeout (in alerts.ts).
	await notifyChainExhausted({ ...details, request_id }).catch((err) => {
		try {
			getLogger().error(
				{ err: err instanceof Error ? err.message : String(err) },
				'[rpcMetrics] alert delivery failed'
			);
		} catch (logErr) {
			console.error('[rpcMetrics] alert delivery failed (and log failed):', logErr);
		}
	});
}
