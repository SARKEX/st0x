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
			'https://api.goldsky.com/api/public/project_cmjr2df7svg6t01tl2ic706ao/subgraphs/sft-base/1.0.6/gn',
		metadata_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn',
		orderbook_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-01-22-c13a/gn',
		orderbook_subgraph_urls_inactive: [],
		paymentTokens: basePaymentTokens,
		defaultPaymentToken: baseDefaultPaymentToken!,
		// Trusted orderbook contract addresses - transactions to unknown orderbooks are blocked
		trustedOrderbooks: [
			'0x498Ff70C5f67e63e53b74551DE31387cf2813986' // Rain Orderbook v4 on Base
		]
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
