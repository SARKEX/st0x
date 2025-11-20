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
}

const basePaymentTokens = PAYMENT_TOKENS_BY_NETWORK[8453] ?? [];
const baseDefaultPaymentToken = DEFAULT_PAYMENT_TOKENS[8453];

export const networks: Network[] = [
	{
		id: 8453,
		chainId: 8453,
		name: 'base',
		raindexNetworkSlug: 'base',
		displayName: 'Base Mainnet',
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
			'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.4/gn',
		metadata_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn',
		orderbook_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-10-11-a62b/gn',
		orderbook_subgraph_urls_inactive: [],
		paymentTokens: basePaymentTokens,
		defaultPaymentToken: baseDefaultPaymentToken!
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
