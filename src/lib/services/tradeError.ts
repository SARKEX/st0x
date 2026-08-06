import { isHttpError } from '$lib/clients/http';
import type { ErrorClass } from '$lib/services/observability/tradeEvents';

export type TradeErrorStage =
	| 'quote'
	| 'calldata'
	| 'approval'
	| 'signing'
	| 'submission'
	| 'confirmation';

export type TradeErrorAction =
	| 'retry'
	| 'adjust_amount'
	| 'reconnect_wallet'
	| 'review_balance'
	| 'try_later'
	| 'contact_support'
	| 'none';

export interface UserFacingTradeError {
	code: string;
	title: string;
	message: string;
	requestId: string | null;
	stage: TradeErrorStage;
	retryable: boolean;
	action: TradeErrorAction;
	errorClass: ErrorClass;
}

type CatalogEntry = Omit<UserFacingTradeError, 'code' | 'requestId' | 'stage'>;

const trustedTradeErrors = new WeakSet<object>();

const DEFAULT_ERROR: CatalogEntry = {
	title: 'Trade could not be completed',
	message: 'Try again. If the problem continues, share the error details with support.',
	retryable: true,
	action: 'retry',
	errorClass: 'unknown'
};

const ERROR_CATALOG: Record<string, CatalogEntry> = {
	SWAP_UNSUPPORTED_TOKEN: {
		title: 'Token not supported',
		message: 'Choose another token pair and try again.',
		retryable: false,
		action: 'none',
		errorClass: 'unknown'
	},
	SWAP_NO_LIQUIDITY: {
		title: 'No liquidity for this trade',
		message:
			'No liquidity available right now for this size. Try a smaller amount or check back in a minute.',
		retryable: true,
		action: 'adjust_amount',
		errorClass: 'no_liquidity'
	},
	SWAP_QUOTE_FAILED: {
		title: 'Quote unavailable',
		message: 'We could not calculate a reliable quote. Refresh the market data and try again.',
		retryable: true,
		action: 'retry',
		errorClass: 'unknown'
	},
	SWAP_PREFLIGHT_FAILED: {
		title: 'Trade verification failed',
		message: 'We could not verify the trade against the latest chain state. Try again.',
		retryable: true,
		action: 'retry',
		errorClass: 'preflight_chain_unreachable'
	},
	SWAP_CALLDATA_FAILED: {
		title: 'Trade preparation failed',
		message: 'We could not prepare the transaction. Refresh the quote and try again.',
		retryable: true,
		action: 'retry',
		errorClass: 'unknown'
	},
	ORDERS_QUERY_FAILED: {
		title: 'Market data unavailable',
		message: 'We could not load current orders. Try again in a moment.',
		retryable: true,
		action: 'retry',
		errorClass: 'rpc_error'
	},
	UPSTREAM_UNAVAILABLE: {
		title: 'Trading service unavailable',
		message: 'A trading service is temporarily unavailable. Try again in a moment.',
		retryable: true,
		action: 'try_later',
		errorClass: 'rpc_error'
	},
	RATE_LIMITED: {
		title: 'Too many requests',
		message: 'Please wait a moment before trying again.',
		retryable: true,
		action: 'try_later',
		errorClass: 'rpc_error'
	},
	NOT_YET_INDEXED: {
		title: 'Trade data is still indexing',
		message: 'This trade data is not available yet. Wait a moment and try again.',
		retryable: true,
		action: 'try_later',
		errorClass: 'unknown'
	},
	BAD_REQUEST: {
		title: 'Trade details were not accepted',
		message: 'Review the trade details and try again.',
		retryable: false,
		action: 'none',
		errorClass: 'unknown'
	},
	UNPROCESSABLE_ENTITY: {
		title: 'Trade details were not accepted',
		message: 'Review the trade details and try again.',
		retryable: false,
		action: 'none',
		errorClass: 'unknown'
	},
	UNAUTHORIZED: {
		title: 'Trading service unavailable',
		message:
			'The trading service could not authorize this request. Contact support if it continues.',
		retryable: false,
		action: 'contact_support',
		errorClass: 'unknown'
	},
	FORBIDDEN: {
		title: 'Trading service unavailable',
		message:
			'The trading service could not authorize this request. Contact support if it continues.',
		retryable: false,
		action: 'contact_support',
		errorClass: 'unknown'
	},
	NOT_FOUND: {
		title: 'Trade route unavailable',
		message: 'The requested trade route is not available. Refresh and try again.',
		retryable: true,
		action: 'retry',
		errorClass: 'unknown'
	},
	INTERNAL_ERROR: {
		...DEFAULT_ERROR,
		title: 'Trading service error'
	},
	TRADE_WALLET_NOT_CONNECTED: {
		title: 'Wallet disconnected',
		message: 'Reconnect your wallet and try again.',
		retryable: true,
		action: 'reconnect_wallet',
		errorClass: 'unknown'
	},
	TRADE_WALLET_ACTION_REJECTED: {
		title: 'Wallet action cancelled',
		message: 'No transaction was submitted. You can try again when ready.',
		retryable: true,
		action: 'retry',
		errorClass: 'user_rejected'
	},
	TRADE_INSUFFICIENT_BALANCE: {
		title: 'Insufficient balance',
		message: 'Reduce the amount or add funds before trying again.',
		retryable: false,
		action: 'review_balance',
		errorClass: 'insufficient_balance'
	},
	TRADE_MARKET_CLOSED: {
		title: 'Market closed',
		message: 'This market is currently closed. Try again during market hours.',
		retryable: false,
		action: 'try_later',
		errorClass: 'market_closed'
	},
	TRADE_SLIPPAGE_EXCEEDED: {
		title: 'Price moved beyond your limit',
		message: 'Refresh the quote or adjust the slippage setting before trying again.',
		retryable: true,
		action: 'retry',
		errorClass: 'slippage_exceeded'
	},
	TRADE_PREFLIGHT_CHAIN_UNREACHABLE: {
		title: 'Could not verify orderbook state',
		message: 'Unable to verify orderbook state. Please refresh quotes and retry.',
		retryable: true,
		action: 'retry',
		errorClass: 'preflight_chain_unreachable'
	},
	TRADE_AUTO_RETRY_EXHAUSTED: {
		title: 'No liquidity for this trade',
		message:
			'No liquidity available right now for this size. Try a smaller amount or check back in a minute.',
		retryable: true,
		action: 'adjust_amount',
		errorClass: 'auto_retry_exhausted'
	},
	TRADE_APPROVAL_FAILED: {
		title: 'Approval failed',
		message: 'The token approval did not complete. Check your wallet and try again.',
		retryable: true,
		action: 'retry',
		errorClass: 'unknown'
	},
	TRADE_SIGNING_FAILED: {
		title: 'Signature failed',
		message: 'The wallet signature did not complete. Check your wallet and try again.',
		retryable: true,
		action: 'retry',
		errorClass: 'unknown'
	},
	TRADE_SUBMISSION_FAILED: {
		title: 'Transaction submission failed',
		message: 'The transaction was not submitted. Check your connection and try again.',
		retryable: true,
		action: 'retry',
		errorClass: 'rpc_error'
	},
	TRADE_CONFIRMATION_FAILED: {
		title: 'Transaction confirmation failed',
		message: 'We could not confirm the transaction. Check the block explorer before retrying.',
		retryable: false,
		action: 'contact_support',
		errorClass: 'rpc_error'
	},
	TRADE_UNKNOWN: DEFAULT_ERROR
};

const STAGE_FALLBACK: Record<TradeErrorStage, string> = {
	quote: 'SWAP_QUOTE_FAILED',
	calldata: 'SWAP_CALLDATA_FAILED',
	approval: 'TRADE_APPROVAL_FAILED',
	signing: 'TRADE_SIGNING_FAILED',
	submission: 'TRADE_SUBMISSION_FAILED',
	confirmation: 'TRADE_CONFIRMATION_FAILED'
};

function safeCode(code: string): string {
	return /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : 'TRADE_UNKNOWN';
}

export function createTradeError(
	code: string,
	options: {
		stage: TradeErrorStage;
		requestId?: string | null;
		errorClass?: ErrorClass;
	}
): UserFacingTradeError {
	const safe = safeCode(code);
	const entry = ERROR_CATALOG[safe] ?? DEFAULT_ERROR;
	const result: UserFacingTradeError = {
		code: safe,
		title: entry.title,
		message: entry.message,
		requestId: options.requestId ?? null,
		stage: options.stage,
		retryable: entry.retryable,
		action: entry.action,
		errorClass: options.errorClass ?? entry.errorClass
	};
	trustedTradeErrors.add(result);
	return result;
}

export function isUserFacingTradeError(error: unknown): error is UserFacingTradeError {
	return Boolean(error && typeof error === 'object' && trustedTradeErrors.has(error));
}

export function toUserFacingTradeError(
	error: unknown,
	stage: TradeErrorStage,
	fallbackCode: string = STAGE_FALLBACK[stage]
): UserFacingTradeError {
	if (isUserFacingTradeError(error)) return error;
	if (isHttpError(error)) {
		if (error.status === 429) {
			return createTradeError('UPSTREAM_UNAVAILABLE', {
				stage,
				requestId: error.requestId
			});
		}
		return createTradeError(error.code, { stage, requestId: error.requestId });
	}

	const candidate = error as { code?: unknown; message?: unknown } | null;
	const message = String(candidate?.message ?? error ?? '').toLowerCase();
	if (candidate?.code === 4001 || /user (rejected|denied)|request rejected/.test(message)) {
		return createTradeError('TRADE_WALLET_ACTION_REJECTED', { stage });
	}
	if (/insufficient|exceeds balance/.test(message)) {
		return createTradeError('TRADE_INSUFFICIENT_BALANCE', { stage });
	}
	if (/wallet.*(not connected|disconnected)/.test(message)) {
		return createTradeError('TRADE_WALLET_NOT_CONNECTED', { stage });
	}
	if (message.includes('slippage')) {
		return createTradeError('TRADE_SLIPPAGE_EXCEEDED', { stage });
	}
	if (message.includes('liquidity') || message.includes('no_walk_fills')) {
		return createTradeError('SWAP_NO_LIQUIDITY', { stage });
	}
	if (message.includes('market') && message.includes('closed')) {
		return createTradeError('TRADE_MARKET_CLOSED', { stage });
	}
	if (
		candidate?.code === -32016 ||
		/rpc|network|timed? ?out|timeout|connection|rate.?limit|too many requests|\b429\b/.test(message)
	) {
		return createTradeError('UPSTREAM_UNAVAILABLE', { stage });
	}

	return createTradeError(fallbackCode, { stage });
}
