import { get } from 'svelte/store';
import { wagmiConfig } from 'svelte-wagmi';
import { wrapToken, unwrapToken } from '$lib/services/wrapService';
import { waitForTransaction } from '$lib/services/walletService';
import { invalidateDashboardBalances } from '$lib/queries/balances';
import { track } from '$lib/services/analytics';
import { TransactionErrorMessage } from '$lib/types/errors';
import {
	transactionStoreInternal,
	classifyError,
	extractTransactionError,
	TransactionStatus
} from './transactionShared';

const { awaitWalletConfirmation, transactionSuccess, transactionError } = transactionStoreInternal;

export async function handleWrapUnwrap(
	mode: 'wrap' | 'unwrap',
	tokenAddress: `0x${string}`,
	amount: bigint,
	userAddress: `0x${string}`,
	tokenSymbol: string,
	targetSymbol: string
) {
	if (!get(wagmiConfig)) throw new Error('Wallet configuration is not available');

	const action = mode === 'wrap' ? 'Wrap' : 'Unwrap';
	try {
		awaitWalletConfirmation(`Confirm ${mode} in your wallet...`);
		const hash =
			mode === 'wrap'
				? await wrapToken(tokenAddress, amount, userAddress)
				: await unwrapToken(tokenAddress, amount, userAddress, userAddress);

		awaitWalletConfirmation('Waiting for transaction confirmation...');
		await waitForTransaction(hash);
		invalidateDashboardBalances();
		track(`${mode}_success`, {
			token_symbol: tokenSymbol,
			target_symbol: targetSymbol,
			transaction_hash: hash
		});
		return transactionSuccess(hash, `${action} complete: ${tokenSymbol} → ${targetSymbol}`);
	} catch (error) {
		track(`${mode}_failed`, {
			token_symbol: tokenSymbol,
			target_symbol: targetSymbol,
			error: classifyError(error)
		});
		return transactionError(
			extractTransactionError(error, `${action} failed` as TransactionErrorMessage)
		);
	}
}

export { TransactionStatus };

export default {
	...transactionStoreInternal,
	handleWrapUnwrap
};
