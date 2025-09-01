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
	shareHolders: ShareHolder[];
	tokenHolders: TokenHolder[];
	activeAuthorizer: Authorizer;
	authorizers: Authorizer[];
	receiptVaultInformations: ReceiptVaultInformation[];
	certifications: Certification[];
	withdraws: Withdraw[];
	deposits: Deposit[];
	shareTransfers: ShareTransfer[];
	receiptBalances: ReceiptBalance[];
	chainId?: number;
};

export type Authorizer = {
	id: string;
	address: Hex;
	offchainAssetReceiptVault?: OffchainAssetReceiptVault;
	isActive: boolean;
	roleHolders: RoleHolder[];
	roles: Role[];
	roleRevokes: RoleRevoke[];
	rolesGranted: RoleGranted[];
};

export type AssetClass = {
	id: string;
	information: string;
	timestamp: string;
	schema: string;
	offchainAssetReceiptVault: OffchainAssetReceiptVault;
};

export interface RoleRevoke {
	role: {
		roleName: string;
	};
	sender: {
		address: string;
	};
	account: {
		address: string;
	};
	timestamp: string;
	transaction: {
		id: string;
	};
}

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
export interface RoleGranted {
	role: {
		roleName: string;
	};
	sender: {
		address: string;
	};
	account: {
		address: string;
	};
	timestamp: string;
	transaction: {
		id: string;
	};
}

export interface Certification {
	timestamp: string;
	id: string;
	certifier: {
		address: string;
	};
	certifiedUntil: string;
	totalShares: string;
	transaction: {
		blockNumber: string;
	};
	data?: string;
	information?: string;
}

/**
 * Represents a shareholder of the vault.
 */
export interface ShareHolder {
	address: string;
}

/**
 * Represents a role holder in the vault.
 */
export interface RoleHolder {
	role?: RoleData;
	account: Account;
}

/**
 * Represents a token holder in the vault.
 */
export interface TokenHolder {
	address: string;
	balance: string;
}

/**
 * Represents a role in the vault.
 */
export interface Role {
	roleName: string;
	roleHolders: RoleHolder[];
	roleHash: string;
}

/**
 * Represents detailed data about a role.
 */
export interface RoleData {
	roleName: string;
	roleHash: string;
}

/**
 * Represents an account, typically a user or entity with an address.
 */
export interface Account {
	address: string;
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

export type ExtendedReceiptBalance = ReceiptBalance & {
	information: Array<Record<string, unknown>>;
	schema: AssetSchema | null;
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

export type ReceiptBalance = {
	receipt: {
		id: string;
		receiptId: string;
		shares: string;
		balances: {
			valueExact: string;
			value: string;
			account: {
				address: string;
			};
		}[];
		deposits: {
			timestamp: string;
			amount: string;
			receipt: {
				receiptId: string;
			};
		}[];
		receiptInformations: {
			information: string;
			id: string;
			transaction: {
				blockNumber: string;
				id: string;
			};
			timestamp: string;
			emitter: {
				address: string;
			};
		}[];
	};
};

export type Receipt = {
	shares: string;
	id: string;
	receiptId: string;
	balances: {
		valueExact: string;
		value: string;
		account: {
			address: string;
		};
	}[];
	deposits: {
		amount: string;
		receipt: {
			receiptId: string;
		};
		timestamp: string;
	}[];
	receiptInformations: {
		information: string;
		id: string;
		transaction: {
			blockNumber: string;
			id: string;
		};
		timestamp: string;
		emitter: {
			address: string;
		};
		receipt: {
			deposits: {
				amount: string;
			}[];
		};
	}[];
};
