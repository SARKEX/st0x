import { env as publicEnv } from '$env/dynamic/public';
import type { Token } from '$lib/types';
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
	/** Previous SFT subgraph URLs for historical data (legacy tokens, old vaults) */
	subgraph_urls_legacy: string[];
	paymentTokens: Token[];
	defaultPaymentToken: Token;
	/** Whitelist of trusted orderbook contract addresses for this network */
	trustedOrderbooks: string[];
}

const basePaymentTokens = PAYMENT_TOKENS_BY_NETWORK[8453] ?? [];
const baseDefaultPaymentToken = DEFAULT_PAYMENT_TOKENS[8453];

// SEC-01 / Phase 3 D-02: PUBLIC_BASE_RPC_URL is the Alchemy app URL exposed to the
// client bundle (single-key both-sides per D-02). Dev fallback keeps `npm run dev`
// working for contributors who haven't provisioned their own Alchemy app. REL-02
// (Wave 5) wraps server-side reads of this URL list in viem's fallback transport.
const PRIMARY_RPC = publicEnv.PUBLIC_BASE_RPC_URL || 'https://base-rpc.publicnode.com';

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
		rpcUrl: PRIMARY_RPC,
		fallbackRpcUrls: [
			'https://base-rpc.publicnode.com',
			PRIMARY_RPC,
			'https://base.llamarpc.com',
			'https://base.meowrpc.com',
			'https://base-mainnet.public.blastapi.io',
			'https://gateway.tenderly.co/public/base'
		],
		icon: 'ethereum',
		subgraph_url:
			'https://api.goldsky.com/api/public/project_cmjr2df7svg6t01tl2ic706ao/subgraphs/sft-base/1.0.12/gn',
		metadata_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/metadata-base/2025-07-06-594f/gn',
		orderbook_subgraph_url:
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2026-02-05-c4ef/gn',
		orderbook_subgraph_urls_inactive: [
			'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-base/2025-10-11-a62b/gn'
		],
		subgraph_urls_legacy: [
			'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-base/1.0.5/gn'
		],
		paymentTokens: basePaymentTokens,
		defaultPaymentToken: baseDefaultPaymentToken!,
		// Trusted orderbook contract addresses - transactions to unknown orderbooks are blocked
		trustedOrderbooks: [
			'0xe522cB4a5fCb2eb31a52Ff41a4653d85A4fd7C9D' // Rain Orderbook v4 on Base
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
