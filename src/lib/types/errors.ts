export enum TransactionErrorMessage {
	USER_REJECTED_APPROVAL = 'The approval transaction was rejected by the user.',
	APPROVAL_FAILED = 'There was an error in the approval transaction, and it failed to approve the tokens to be spent. Please see the block explorer link for more information.',
	TIMEOUT = 'This is taking longer than expected. Your transaction may still complete — check the block explorer for status.',
	BALANCE_REFRESH_FAILED = 'There was an error refreshing your balances. This does not mean that the transaction was unsuccessful. Please see the block explorer link for more information.',
	GENERIC = 'Something went wrong. Please try again, or contact support on Telegram if the issue persists.'
}
