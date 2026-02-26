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
	confidence: number | null; // Pyth confidence interval
	priceFeedId: string; // Pyth price feed ID
	pricePublishTime: number | null; // Pyth publish timestamp
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
	price: SnapshotPrice | null; // Pyth price at snapshot time
	priceTimestamp: number | null; // Timestamp used for Pyth price fetch (may differ from block timestamp if outside market hours)
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
