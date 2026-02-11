// types.ts

import type { Hex } from 'viem';

export type MetaV1S = {
	id: string;
	meta: string;
	sender: string;
	subject: string;
	metaHash: string;
};

/**
 * Represents an Offchain Asset Receipt Vault.
 */
export type OffchainAssetReceiptVault = {
	id: string;
	totalShares: string;
	address: Hex;
	deployer: string;
	admin: string;
	name: string;
	symbol: string;
	deployTimestamp: string;
	receiptContractAddress: string;
	tokenHolders: TokenHolder[];
	receiptVaultInformations: ReceiptVaultInformation[];
	withdraws: Withdraw[];
	deposits: Deposit[];
	shareTransfers: ShareTransfer[];
	chainId?: number;
};

export interface ShareTransfer {
	id: string;
	timestamp: string;
	from: {
		address: string;
	};
	to: {
		address: string;
	};
	value: string;
}

export type ReceiptInformation = {
	information: string;
	payload: string;
	schema: string;
	emitter: {
		address: string;
	};
};

export interface DepositWithMetadata extends DepositWithReceipt {
	schema?: {
		displayName: string;
	};
	information?: string;
}

export type Withdraw = {
	id: string;
	emitter: {
		address: string;
	};
	transaction: {
		id: string;
	};
	receipt: {
		id: string;
		receiptId: string;
		receiptInformations: ReceiptInformation[];
	};
	amount: string;
	caller: {
		address: string;
	};
	timestamp: string;
};

export interface Deposit {
	schema?: { displayName: string } | undefined;
	id: string;
	transaction: {
		id: string;
	};
	emitter: {
		address: string;
	};
	receipt: {
		id: string;
		receiptId: string;
		receiptInformations: Array<{
			payload: string;
			schema: string;
			information: string;
			emitter: {
				address: string;
			};
		}>;
	};
	amount: string;
	caller: {
		address: string;
	};
	timestamp: string;
}
/**
 * Represents a token holder in the vault.
 */
export interface TokenHolder {
	address: string;
	balance: string;
}

/**
 * Represents information about the receipt vault, typically logs or updates.
 */
export interface ReceiptVaultInformation {
	timestamp: string;
	information: string;
	id: string;
	caller: {
		address: string;
	};
	transaction: {
		blockNumber: string;
	};
}

import type { SchemaProperty } from './SchemaQueryResponse';

export type AssetSchema = {
	displayName: string;
	schema: {
		type: string;
		properties: Record<string, SchemaProperty>;
		required?: string[];
		description?: string;
	};
	timestamp: string;
	id: string;
	hash: string;
};

export type ExtendedDeposit = Deposit & {
	information: Array<Record<string, unknown>>;
	schema: AssetSchema | null;
};

export type DepositWithReceipt = {
	id: string;
	erc1155TokenId: string;
	offchainAssetReceiptVault: {
		symbol: string;
		address: string;
	};
	amount: string;
	timestamp: string;
	transaction: {
		id: string;
	};
	emitter: {
		address: string;
	};
	receiver: {
		address: string;
	};
	data: string;
	receipt: {
		receiptId: string;
		receiptInformations: Array<{
			information: string;
			payload: string;
			schema: string;
		}>;
	};
};

export interface WithdrawWithReceipt extends Withdraw {
	erc1155TokenId: string;
	id: string;
	emitter: {
		address: string;
	};
	offchainAssetReceiptVault: {
		symbol: string;
		address: string;
	};
	transaction: {
		id: string;
	};
	receipt: {
		id: string;
		receiptId: string;
		receiptInformations: {
			information: string;
			payload: string;
			schema: string;
			emitter: {
				address: string;
			};
		}[];
	};
	amount: string;
	caller: {
		address: string;
	};
	timestamp: string;
}

