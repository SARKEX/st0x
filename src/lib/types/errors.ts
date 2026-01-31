export enum TransactionErrorMessage {
	USER_REJECTED_APPROVAL = 'The approval transaction was rejected by the user.',
	APPROVAL_FAILED = 'There was an error in the approval transaction, and it failed to approve the tokens to be spent. Please see the block explorer link for more information.',
	TIMEOUT = 'Transaction timed out... Your transaction may still succeed - please see the block explorer link for more information.',
	BALANCE_REFRESH_FAILED = 'There was an error refreshing your balances. This does not mean that the transaction was unsuccessful. Please see the block explorer link for more information.',
	GENERIC = 'Something went wrong. See the telegram group for support.'
}

export class Web3Error extends Error {
	constructor(
		message: string,
		public code?: string | number
	) {
		super(message);
		this.name = 'Web3Error';
	}
}

export class RPCError extends Web3Error {
	constructor(message: string, code?: string | number) {
		super(message, code);
		this.name = 'RPCError';
	}
}

export class GasEstimationError extends Web3Error {
	constructor(message: string, code?: string | number) {
		super(message, code);
		this.name = 'GasEstimationError';
	}
}

export class WalletRejectedError extends Web3Error {
	constructor(message: string = 'Transaction rejected by user') {
		super(message, 4001);
		this.name = 'WalletRejectedError';
	}
}
