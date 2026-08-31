import { writable } from 'svelte/store';
import type { Hex } from 'viem';
import { TransactionErrorMessage } from '$lib/types/errors';

export function classifyError(error: unknown): string {
	const message = ((error as Error)?.message ?? '').toLowerCase();
	if (message.includes('user rejected') || message.includes('user denied')) return 'user_rejected';
	if (message.includes('insufficient funds')) return 'insufficient_funds';
	if (message.includes('timeout') || message.includes('timed out')) return 'timeout';
	if (message.includes('network') || message.includes('disconnected')) return 'network_error';
	if (message.includes('gas')) return 'gas_error';
	if (message.includes('revert')) return 'transaction_reverted';
	return 'unknown';
}

export function extractTransactionError(
	error: unknown,
	fallback: TransactionErrorMessage = TransactionErrorMessage.GENERIC
): TransactionErrorMessage {
	const transactionError = error as { cause?: { details?: string }; message?: string };
	return (transactionError?.cause?.details ||
		transactionError?.message ||
		fallback) as TransactionErrorMessage;
}

export enum TransactionStatus {
	IDLE = 'Idle',
	PENDING_WALLET = 'Waiting for wallet confirmation...',
	SUCCESS = 'Success! Transaction confirmed',
	ERROR = 'Something went wrong'
}

type TransactionState = {
	status: TransactionStatus;
	error: string;
	hash: string | Hex;
	message: string;
};

const initialState: TransactionState = {
	status: TransactionStatus.IDLE,
	error: '',
	hash: '',
	message: ''
};

function createTransactionStore() {
	const { subscribe, set, update } = writable(initialState);
	const reset = () => set(initialState);
	const setState = (
		status: TransactionStatus,
		options: { message?: string; hash?: string; error?: string } = {}
	) =>
		update((state) => ({
			...state,
			status,
			message: options.message ?? '',
			hash: options.hash ?? '',
			error: options.error ?? ''
		}));

	return {
		subscribe,
		set,
		update,
		reset,
		setState,
		awaitWalletConfirmation: (message?: string) =>
			setState(TransactionStatus.PENDING_WALLET, { message }),
		transactionSuccess: (hash: string, message?: string) =>
			setState(TransactionStatus.SUCCESS, { hash, message }),
		transactionError: (message: TransactionErrorMessage, hash?: string) =>
			setState(TransactionStatus.ERROR, { error: message, hash })
	};
}

export const transactionStoreInternal = createTransactionStore();
