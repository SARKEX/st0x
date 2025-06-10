import { Token } from 'sushi/currency';
import { arbitrum } from '@wagmi/core/chains';
import type { Sft } from './types';

export const USDC_TOKEN = new Token({
	chainId: arbitrum.id,
	address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
	symbol: 'USDC',
	decimals: 6
});

export const ARBITRUM_SFT_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-arbitrum-one/1.0.1/gn';
export const ARBITRUM_ORDERBOOK_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-arbitrum-one/2024-12-13-7435/gn';
export const TARGET_NETWORK = 'arbitrum';
export const TARGET_NETWORK_EXPLORER_URL = 'https://arbiscan.io/';

export const STOXs: Token[] = [
	new Token({
		chainId: arbitrum.id,
		address: '0x6F69D14e0d7e736510A6F1499255F8Ba3b4A951b',
		symbol: 'TSTOX',
		decimals: 18,
		name: 'Test St0x'
	}),
	new Token({
		chainId: arbitrum.id,
		address: '0x294afcc97cc03bd7e4dccf4addf2a1497d96d454',
		symbol: 'AAPLs1',
		decimals: 18,
		name: 'STx Apple 01'
	}),
	new Token({
		chainId: arbitrum.id,
		address: '0x2e93b2c6cb3ac1b9993e784686c5637de28c2c2a',
		symbol: 'AMZNs1',
		decimals: 18,
		name: 'STx Amazon 01'
	}),
	new Token({
		chainId: arbitrum.id,
		address: '0xaca45fea0049823e809f0e789144c21d96230996',
		symbol: 'GOOGLs1',
		decimals: 18,
		name: 'STx Alphabet 01'
	}),
	new Token({
		chainId: arbitrum.id,
		address: '0x52946181fe3e3ab967a52f7294fa1cd39ae882e9',
		symbol: 'METAs1',
		decimals: 18,
		name: 'STx Meta 01'
	}),
	new Token({
		chainId: arbitrum.id,
		address: '0x20c40dd9e905482e6bc7c06de3383104746b7928',
		symbol: 'MSFTs1',
		decimals: 18,
		name: 'STx Microsoft 01'
	}),
	new Token({
		chainId: arbitrum.id,
		address: '0x6696E32EbD293783bCb4b4f157Da02A65789e38e',
		symbol: 'TSLAs1',
		decimals: 18,
		name: 'STx Tesla 01'
	}),
	new Token({
		chainId: arbitrum.id,
		address: '0x5191aF5069923b4AA2120f456ADbACF4d7Cf2a87',
		symbol: 'NVDAs1',
		decimals: 18,
		name: 'STx Nvidia 01'
	})
];
