import { Token } from 'sushi/currency';
import { polygon } from '@wagmi/core/chains';

export const TARGET_NETWORK_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-matic/2024-12-13-d2b4/gn';
export const TARGET_NETWORK = 'polygon';

export const MNW_TOKEN = new Token({
	chainId: polygon.id,
	address: '0x3c59798620e5fEC0Ae6dF1A19c6454094572Ab92',
	symbol: 'MNW',
	decimals: 18
});

export const USDC_TOKEN = new Token({
	chainId: polygon.id,
	address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
	symbol: 'USDC',
	decimals: 6
});

export const WPOL_TOKEN = new Token({
	chainId: polygon.id,
	address: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
	symbol: 'WPOL',
	decimals: 18
});
