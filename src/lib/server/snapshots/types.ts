// Types for snapshot generation (modeled after albion.rewards)

export interface Transfer {
	from: string;
	to: string;
	value: string;
	blockNumber: number;
	timestamp: number;
	tokenAddress: string;
}

export interface SnapshotInfo {
	blockNumber: number;
	timestamp: number;
}

export interface TokenBalances {
	[address: string]: string; // wallet address -> balance (as string for BigInt serialization)
}

export interface SnapshotPrice {
	price: number | null; // USD price at snapshot time
	/** Retained for backward compatibility with existing snapshot blobs. */
	confidence: number | null;
	pricePublishTime: number | null; // REST observation timestamp
}

export interface BlockSnapshot {
	blockNumber: number;
	timestamp: number;
	generatedAt: string;
	tokenAddress: string;
	tokenSymbol: string;
	balances: TokenBalances;
	excludedWallets: string[]; // Wallets that are excluded from TVL calculations
	totalSupply: string;
	price: SnapshotPrice | null; // Retained platform midpoint at snapshot time
	priceTimestamp: number | null; // REST observation timestamp
}

export interface SubgraphTransfer {
	id: string;
	timestamp: string;
	transaction: {
		id: string;
		blockNumber: string;
		timestamp: string;
	};
	from: {
		address: string;
	};
	to: {
		address: string;
	};
	value: string;
	valueExact: string;
	offchainAssetReceiptVault: {
		id: string;
	};
}

export interface SubgraphWrappedTokenTransfer {
	id: string;
	from: string;
	to: string;
	value: string;
	transaction: {
		id: string;
		blockNumber: string;
		timestamp: string;
	};
	offchainAssetReceiptVault: {
		id: string;
		wrappedTokenContractAddress: string;
	};
}
