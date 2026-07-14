/**
 * Sentry reporting for handled failures in the frontend trade flow (RAI-260).
 *
 * SvelteKit's global error hooks only see unhandled exceptions. Trade code deliberately
 * converts most wallet/SDK failures into transaction-store state, so those failures need
 * an explicit reporting boundary. This module keeps that boundary consistent and attaches
 * the correlation fields required to reconstruct a single user attempt.
 */

import * as Sentry from '@sentry/sveltekit';
import { classifyError } from './classifyError';
import { getCurrentTradeId } from './tradeId';

export type TradeFlowStage =
	| 'quote'
	| 'calldata'
	| 'approval'
	| 'signing'
	| 'submission'
	| 'confirmation';

export interface TradeFlowContext {
	stage: TradeFlowStage;
	operation: string;
	orderType: 'market' | 'limit' | 'dca';
	orderSide?: 'buy' | 'sell';
	tradeId?: string | null;
	chainId?: number | null;
	assetSymbol?: string;
	paymentSymbol?: string;
	batch?: number;
	totalBatches?: number;
}

function asError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

function compactContext(context: TradeFlowContext): Record<string, string | number> {
	return Object.fromEntries(
		Object.entries({
			operation: context.operation,
			order_type: context.orderType,
			order_side: context.orderSide,
			trade_id: context.tradeId ?? getCurrentTradeId() ?? undefined,
			chain_id: context.chainId ?? undefined,
			asset_symbol: context.assetSymbol,
			payment_symbol: context.paymentSymbol,
			batch: context.batch,
			total_batches: context.totalBatches
		}).filter((entry): entry is [string, string | number] => entry[1] !== undefined)
	);
}

/**
 * Classify a wallet-bound failure at the point where `sendTransaction` rejects.
 * User rejection happens during signing; other failures at this boundary are submission
 * failures (RPC, simulation, broadcast, or wallet transport).
 */
export function inferWalletFailureStage(error: unknown): 'signing' | 'submission' {
	return classifyError(error) === 'user_rejected' ? 'signing' : 'submission';
}

/** Add a low-cardinality breadcrumb for the successful path leading up to an error. */
export function addTradeFlowBreadcrumb(
	context: TradeFlowContext,
	status: 'started' | 'completed'
): void {
	try {
		Sentry.addBreadcrumb({
			category: 'trade.flow',
			type: 'info',
			level: 'info',
			message: `${context.stage}:${context.operation}:${status}`,
			data: compactContext(context)
		});
	} catch (sentryError) {
		console.error('[tradeFlow] Sentry breadcrumb failed:', sentryError);
	}
}

/**
 * Capture a handled trade failure without throwing back into the transaction flow.
 * Expected user-controlled failures stay visible for funnel diagnosis but use warning
 * severity so they do not page as application incidents.
 */
export function captureTradeFlowError(error: unknown, context: TradeFlowContext): void {
	const normalized = asError(error);
	const errorClass = classifyError(
		normalized,
		context.orderType === 'market' ? 'market' : 'deploy'
	);
	const data = compactContext(context);
	const tradeId = context.tradeId ?? getCurrentTradeId();

	try {
		Sentry.captureException(normalized, {
			level:
				errorClass === 'user_rejected' || errorClass === 'insufficient_balance'
					? 'warning'
					: 'error',
			tags: {
				feature: 'trade_flow',
				trade_stage: context.stage,
				trade_operation: context.operation,
				order_type: context.orderType,
				error_class: errorClass,
				...(context.orderSide ? { order_side: context.orderSide } : {}),
				...(tradeId ? { trade_id: tradeId } : {}),
				...(context.chainId != null ? { chain_id: String(context.chainId) } : {})
			},
			contexts: {
				trade_flow: data
			}
		});
	} catch (sentryError) {
		console.error('[tradeFlow] Sentry capture failed:', sentryError);
	}
}
