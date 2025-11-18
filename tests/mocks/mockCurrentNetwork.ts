export const mockCurrentNetwork = {
	id: 8453,
	chainId: 8453,
	name: 'base',
	raindexNetworkSlug: 'base2',
	displayName: 'Base Mainnet',
	currencySymbol: 'ETH',
	blockExplorer: 'https://basescan.org',
	sftExplorer: 'https://stox2.h20.market',
	blockExplorerIcon: 'etherscan',
	rpcUrl: 'https://base-rpc.publicnode.com',
	icon: 'ethereum',
	subgraph_url:
		'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.4/gn',
	metadata_subgraph_url:
		'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn',
	orderbook_subgraph_url:
		'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-08-18-2744/gn',
	paymentTokens: [
		{
			chainId: 8453,
			address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
			symbol: 'USDC',
			decimals: 6,
			name: 'USD Coin',
			logoUrl: '/images/USDC.png',
			priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
		}
	],
	defaultPaymentToken: {
		chainId: 8453,
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
	}
};

Object.assign(mockCurrentNetwork, {
	settlementTokens: mockCurrentNetwork.paymentTokens,
	defaultSettlementToken: mockCurrentNetwork.defaultPaymentToken
});
