import type { PythToken } from '$lib/types';
import {
	DEFAULT_PAYMENT_TOKENS,
	PAYMENT_TOKENS_BY_NETWORK,
	getDefaultPaymentTokenForNetwork,
	getPaymentTokensForNetwork
} from '$lib/config/tokens';

export interface Network {
	id: number;
	chainId: number;
	name: string;
	raindexNetworkSlug: string;
	displayName: string;
	currencySymbol: string;
	blockExplorer: string;
	sftExplorer: string;
	blockExplorerIcon: string;
	rpcUrl: string;
	fallbackRpcUrls: string[];
	icon: string;
	subgraph_url: string;
	metadata_subgraph_url: string;
	orderbook_subgraph_url: string;
	orderbook_subgraph_urls_inactive: string[];
	paymentTokens: PythToken[];
	defaultPaymentToken: PythToken;
	/** Whitelist of trusted orderbook contract addresses for this network */
	trustedOrderbooks: string[];
}

const basePaymentTokens = PAYMENT_TOKENS_BY_NETWORK[8453] ?? [];
const baseDefaultPaymentToken = DEFAULT_PAYMENT_TOKENS[8453];

const arbitrumPaymentTokens = PAYMENT_TOKENS_BY_NETWORK[42161] ?? [];
const arbitrumDefaultPaymentToken = DEFAULT_PAYMENT_TOKENS[42161];

const optimismPaymentTokens = PAYMENT_TOKENS_BY_NETWORK[10] ?? [];
const optimismDefaultPaymentToken = DEFAULT_PAYMENT_TOKENS[10];

const ethereumPaymentTokens = PAYMENT_TOKENS_BY_NETWORK[1] ?? [];
const ethereumDefaultPaymentToken = DEFAULT_PAYMENT_TOKENS[1];

export const networks: Network[] = [
	{
		id: 8453,
		chainId: 8453,
		name: 'base',
		raindexNetworkSlug: 'base',
		displayName: 'Base',
		currencySymbol: 'ETH',
		blockExplorer: 'https://basescan.org',
		sftExplorer: 'https://stox2.h20.market',
		blockExplorerIcon: 'etherscan',
		rpcUrl: 'https://mainnet.base.org',
		fallbackRpcUrls: [
			'https://base-rpc.publicnode.com',
			'https://mainnet.base.org',
			'https://base.llamarpc.com',
			'https://base.meowrpc.com',
			'https://base-mainnet.public.blastapi.io',
			'https://gateway.tenderly.co/public/base'
		],
		icon: 'ethereum',
		subgraph_url:
			'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.5/gn',
		metadata_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn',
		orderbook_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-10-11-a62b/gn',
		orderbook_subgraph_urls_inactive: [],
		paymentTokens: basePaymentTokens,
		defaultPaymentToken: baseDefaultPaymentToken!,
		trustedOrderbooks: [
			'0x52CEB8eBEf648744fFDDE89F7Bc9C3aC35944775' // Rain Orderbook v4 on Base
		]
	},
	{
		id: 42161,
		chainId: 42161,
		name: 'arbitrum',
		raindexNetworkSlug: 'arbitrum',
		displayName: 'Arbitrum',
		currencySymbol: 'ETH',
		blockExplorer: 'https://arbiscan.io',
		sftExplorer: '',
		blockExplorerIcon: 'etherscan',
		rpcUrl: 'https://arb1.arbitrum.io/rpc',
		fallbackRpcUrls: [
			'https://arb1.arbitrum.io/rpc',
			'https://arbitrum.llamarpc.com',
			'https://arbitrum-one.public.blastapi.io',
			'https://arbitrum-one.publicnode.com'
		],
		icon: 'ethereum',
		subgraph_url: '',
		metadata_subgraph_url: '',
		orderbook_subgraph_url: '',
		orderbook_subgraph_urls_inactive: [],
		paymentTokens: arbitrumPaymentTokens,
		defaultPaymentToken: arbitrumDefaultPaymentToken!,
		trustedOrderbooks: [] // Payment-only network (swaps to Base via AA)
	},
	{
		id: 10,
		chainId: 10,
		name: 'optimism',
		raindexNetworkSlug: 'optimism',
		displayName: 'Optimism',
		currencySymbol: 'ETH',
		blockExplorer: 'https://optimistic.etherscan.io',
		sftExplorer: '',
		blockExplorerIcon: 'etherscan',
		rpcUrl: 'https://mainnet.optimism.io',
		fallbackRpcUrls: [
			'https://mainnet.optimism.io',
			'https://optimism.llamarpc.com',
			'https://optimism.publicnode.com',
			'https://optimism-mainnet.public.blastapi.io',
			'https://rpc.ankr.com/optimism'
		],
		icon: 'ethereum',
		subgraph_url: '',
		metadata_subgraph_url: '',
		orderbook_subgraph_url: '',
		orderbook_subgraph_urls_inactive: [],
		paymentTokens: optimismPaymentTokens,
		defaultPaymentToken: optimismDefaultPaymentToken!,
		trustedOrderbooks: [] // Payment-only network (swaps to Base via AA)
	},
	{
		id: 1,
		chainId: 1,
		name: 'ethereum',
		raindexNetworkSlug: 'ethereum',
		displayName: 'Ethereum',
		currencySymbol: 'ETH',
		blockExplorer: 'https://etherscan.io',
		sftExplorer: '',
		blockExplorerIcon: 'etherscan',
		rpcUrl: 'https://eth.llamarpc.com',
		fallbackRpcUrls: [
			'https://eth.llamarpc.com',
			'https://ethereum.publicnode.com',
			'https://rpc.ankr.com/eth',
			'https://eth.meowrpc.com'
		],
		icon: 'ethereum',
		subgraph_url: '',
		metadata_subgraph_url: '',
		orderbook_subgraph_url: '',
		orderbook_subgraph_urls_inactive: [],
		paymentTokens: ethereumPaymentTokens,
		defaultPaymentToken: ethereumDefaultPaymentToken!,
		trustedOrderbooks: [] // Payment-only network (swaps to Base via AA)
	}
];

export function getNetworkById(id: number): Network | undefined {
	return networks.find((network) => network.id === id);
}

export function getNetworkByChainId(chainId: number): Network | undefined {
	return networks.find((network) => network.chainId === chainId);
}

export function getNetworkByName(name: string): Network | undefined {
	return networks.find((network) => network.name === name);
}

export {
	DEFAULT_PAYMENT_TOKENS,
	getDefaultPaymentTokenForNetwork,
	getPaymentTokensForNetwork,
	PAYMENT_TOKENS_BY_NETWORK
};
