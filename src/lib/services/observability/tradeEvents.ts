/**
 * Trade-event typed wrapper (OBS-07 Plan 02-01 Task 2).
 *
 * Single entry point for emitting funnel-investigation PostHog events tied to a trade
 * lifecycle. Delegates to `analytics.track()` (which enriches with wallet_address /
 * auth_method / network) and adds the active `trade_id` from the lifecycle module.
 *
 * Per CONTEXT D-01: PostHog is the primary funnel-investigation surface. This module
 * is the single source of truth for what trade events look like — typed `TradeEventName`
 * + `TradeEventProps` + `ErrorClass` unions. Anti-pattern: never inline raw `track()`
 * for any name in `TradeEventName` — always go through `trackTradeEvent` so the
 * event picks up `trade_id` if one is active (panel-level events that fire
 * before a submit click correctly emit `trade_id: null`).
 *
 * Per Pitfall 7 (event-name collision): KEEP existing snake_case names — do NOT rename.
 *
 * Threat T-2-B (PII leak via error_message): per-property scrubbing strips 0x[40]
 * addresses + 0x[130] signatures BEFORE the payload reaches `track()`. The Sentry-side
 * scrubber `src/lib/observability/scrub.ts` covers Sentry events; PostHog event
 * properties need parallel coverage. The constants are duplicated (not imported)
 * because scrub.ts targets a different SDK boundary.
 *
 * Project convention: logging never throws back into the caller. The entire delegated
 * call is wrapped in try/catch.
 */

import { track } from '$lib/services/analytics';
import { getCurrentTradeId } from '$lib/services/observability/tradeId';

export type TradeEventName =
	| 'trade_panel_opened'
	| 'trade_button_clicked'
	| 'quote_received'
	| 'trade_initiated'
	| 'sign_approval'
	| 'sign_trade'
	| 'broadcast'
	| 'confirmed'
	| 'trade_failed'
	| 'trade_panel_abandoned'
	| 'trade_error_shown'
	| 'limit_order_deployed';

export type ErrorClass =
	| 'slippage_exceeded'
	| 'no_liquidity'
	| 'stale_oracle'
	| 'insufficient_balance'
	| 'market_closed'
	| 'user_rejected'
	| 'rpc_error'
	| 'preflight_chain_unreachable'
	| 'preflight_order_vanished'
	| 'auto_retry_exhausted'
	| 'unknown';

export interface TradeEventProps {
	order_type: 'market' | 'limit' | 'dca';
	order_side?: 'buy' | 'sell';
	mode?: 'spendUpTo' | 'buyUpTo';
	asset_symbol?: string;
	payment_symbol?: string;
	amount?: string;
	slippage_bps?: number;
	error_class?: ErrorClass;
	error_message?: string;
	// Tolerate existing call-site extras (e.g. token_symbol, intended_trade_size_usd)
	[key: string]: unknown;
}

// Defense-in-depth: scrub any `0x[40]` address or `0x[130]` signature that leaks into
// error_message. Mirrors `src/lib/observability/scrub.ts` ADDR_RE / SIG_RE — duplicated
// here because that scrubber operates only at the Sentry boundary; PostHog event
// properties need parallel coverage (T-2-B).
const ADDR_RE = /0x[a-fA-F0-9]{40}/g;
const SIG_RE = /0x[a-fA-F0-9]{130}/g;

function scrubProps(props: TradeEventProps): TradeEventProps {
	if (typeof props.error_message !== 'string') return props;
	const cleaned = props.error_message
		.replace(SIG_RE, '[REDACTED_SIGNATURE]')
		.replace(ADDR_RE, '[REDACTED_ADDR]');
	return { ...props, error_message: cleaned };
}

export function trackTradeEvent(name: TradeEventName, props: TradeEventProps): void {
	try {
		const safe = scrubProps(props);
		track(name, { ...safe, trade_id: getCurrentTradeId() });
	} catch (err) {
		// Logging never throws back into caller (project convention)
		console.error('[trackTradeEvent] failed:', err);
	}
}
