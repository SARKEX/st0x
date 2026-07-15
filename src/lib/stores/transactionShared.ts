/**
 * Shared transaction-store leaf module.
 *
 * Extracted from transaction.ts (TRADE-02) so deploy-, market-take-, approval-,
 * and partial-fill-detection state machines can share TransactionStatus +
 * interfaces without circular imports, and so the types are easily unit-tested.
 *
 * This file is a runtime LEAF — it imports no values from $lib/services or any
 * other $lib/stores/* module. The dependency-graph direction is one-way:
 *   transactionShared → consumers (deployTransactionStore, marketTakeStore,
 *                                   approvalStore, partialFillDetection,
 *                                   transaction.ts façade)
 */

import { writable } from 'svelte/store';
import type { Hex } from 'viem';
import type { Network } from '$lib/config/network';
import { TransactionErrorMessage } from '$lib/types/errors';
import type { UserFacingTradeError } from '$lib/services/tradeError';

/**
 * Classify error messages into safe, non-sensitive categories for analytics.
 * Avoids sending raw error messages that may contain addresses, keys, or internal details.
 */
export function classifyError(error: unknown): string {
	const msg = ((error as Error)?.message ?? '').toLowerCase();
	if (msg.includes('user rejected') || msg.includes('user denied')) return 'user_rejected';
	if (msg.includes('insufficient funds') || msg.includes('exceeds balance'))
		return 'insufficient_funds';
	if (msg.includes('allowance') || msg.includes('exceeds allowance'))
		return 'insufficient_allowance';
	if (msg.includes('nonce')) return 'nonce_error';
	if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
	if (msg.includes('network') || msg.includes('disconnected')) return 'network_error';
	if (msg.includes('header not found') || msg.includes('block not found')) return 'rpc_error';
	if (msg.includes('gas')) return 'gas_error';
	if (msg.includes('reverted') || msg.includes('revert')) return 'transaction_reverted';
	return 'unknown';
}

/**
 * Validates that an orderbook address is in the trusted whitelist for the current network.
 * This prevents transactions to malicious contracts if the API or subgraph is compromised.
 *
 * @param orderbookAddress - The orderbook address to validate
 * @param network - The current network configuration
 * @returns true if the orderbook is trusted, false otherwise
 */
export function isOrderbookTrusted(orderbookAddress: string, network: Network): boolean {
	const normalizedAddress = orderbookAddress.toLowerCase();
	return network.trustedOrderbooks.some((trusted) => trusted.toLowerCase() === normalizedAddress);
}

/**
 * Throws an error if the orderbook address is not in the trusted whitelist.
 * Call this before sending any transaction to an orderbook contract.
 */
export function validateOrderbookAddress(orderbookAddress: string, network: Network): void {
	if (!isOrderbookTrusted(orderbookAddress, network)) {
		console.error('[Security] Untrusted orderbook address blocked:', {
			address: orderbookAddress,
			trustedOrderbooks: network.trustedOrderbooks
		});
		throw new Error(
			'Transaction blocked: Untrusted orderbook contract. Please contact support if this is unexpected.'
		);
	}
}

/**
 * Extract error message from transaction errors using standard Viem error hierarchy.
 */
export function extractTransactionError(
	error: unknown,
	fallback: TransactionErrorMessage = TransactionErrorMessage.GENERIC
): TransactionErrorMessage {
	const err = error as { cause?: { details?: string }; message?: string };
	return (err?.cause?.details || err?.message || fallback) as TransactionErrorMessage;
}

export enum TransactionStatus {
	IDLE = 'Idle',
	CHECKING_ALLOWANCE = 'Checking your approved spend...',
	PENDING_WALLET = 'Waiting for wallet confirmation...',
	PENDING_APPROVAL = 'Approving spend...',
	PENDING_MULTI_TX_ACKNOWLEDGMENT = 'Multiple transactions required',
	SUCCESS = 'Success! Transaction confirmed',
	ERROR = 'Something went wrong'
}

export interface MarketOrderSummary {
	inputAmount: bigint; // What the user RECEIVES
	inputTokenDecimals: number;
	inputTokenSymbol: string;
	inputTokenAddress: string;
	outputAmount: bigint; // What the user GIVES AWAY
	outputTokenDecimals: number;
	outputTokenSymbol: string;
	outputTokenAddress: string;
	requestedInputAmount: bigint; // What the user requested to receive
	ioRatio: number; // input per output (how much input received per unit output given)
	actualSlippage: bigint;
	isPartialFill: boolean;
	isNoFill?: boolean;
}

// Asset token info for Track in Wallet prompt after order deployment
export interface AssetTokenInfo {
	address: string;
	symbol: string;
	decimals: number;
}

// Multi-transaction tracking for split orders
export interface MultiTxProgress {
	currentBatch: number;
	totalBatches: number;
}

export interface RaindexLink {
	url: string;
	text: string;
}

export interface TransactionMetadata {
	marketOrderSummary?: MarketOrderSummary;
	assetTokenInfo?: AssetTokenInfo; // For limit/DCA order deployments
	multiTxProgress?: MultiTxProgress; // For split order transactions
	raindexLink?: RaindexLink; // Safe link data (replaces @html)
}

const initialState = {
	status: TransactionStatus.IDLE,
	error: '',
	hash: '' as string | Hex,
	data: null as TransactionMetadata | null,
	functionName: '',
	message: '',
	tradeError: null as UserFacingTradeError | null,
	multiTxAcknowledged: false,
	onMultiTxAcknowledge: null as (() => void) | null
};

/**
 * Internal writable factory + status helpers.
 *
 * Exported as `transactionStoreInternal` so:
 *   - the `transaction.ts` façade can spread its store-API surface (subscribe/set/update/reset)
 *     into its default export to preserve the 15+ existing UI binding sites.
 *   - downstream state-machine modules (deployTransactionStore, marketTakeStore — added in
 *     Plans 03/04) can call `transactionStoreInternal.awaitWalletConfirmation(...)` etc.
 *     without knowing they are talking to a leaf module.
 */
const createTransactionStore = () => {
	const { subscribe, set, update } = writable(initialState);
	const reset = () => set(initialState);

	// Generic state update helper
	const setState = (
		status: TransactionStatus,
		options: {
			message?: string;
			hash?: string;
			error?: string;
			data?: TransactionMetadata | null;
			tradeError?: UserFacingTradeError | null;
		} = {}
	) =>
		update((state) => ({
			...state,
			status,
			message: options.message ?? '',
			hash: options.hash ?? '',
			error: options.error ?? '',
			data: options.data ?? null,
			tradeError: options.tradeError ?? null
		}));

	const checkingWalletAllowance = (message?: string) =>
		setState(TransactionStatus.CHECKING_ALLOWANCE, { message });
	const awaitWalletConfirmation = (message?: string, data?: TransactionMetadata) =>
		setState(TransactionStatus.PENDING_WALLET, { message, data });
	const awaitApprovalTx = (hash: string) => setState(TransactionStatus.PENDING_APPROVAL, { hash });
	const transactionSuccess = (hash: string, message?: string, data?: TransactionMetadata) =>
		setState(TransactionStatus.SUCCESS, { hash, message, data });
	const transactionError = (
		message: TransactionErrorMessage,
		hash?: string,
		tradeError?: UserFacingTradeError
	) => setState(TransactionStatus.ERROR, { error: message, hash, tradeError });

	const acknowledgeMultiTx = () => {
		update((state) => {
			if (state.onMultiTxAcknowledge) {
				state.onMultiTxAcknowledge();
			}
			return state;
		});
	};

	return {
		subscribe,
		set,
		update,
		reset,
		setState,
		checkingWalletAllowance,
		awaitWalletConfirmation,
		awaitApprovalTx,
		transactionSuccess,
		transactionError,
		acknowledgeMultiTx
	};
};

export const transactionStoreInternal = createTransactionStore();
