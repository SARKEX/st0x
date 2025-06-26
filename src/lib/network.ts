import { Token } from 'sushi/currency';
import { arbitrum } from '@wagmi/core/chains';
import type { PythToken } from './types';

export const USDC_TOKEN = {
	chainId: arbitrum.id,
	address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
	symbol: 'USDC',
	decimals: 6,
	logoUrl: '/images/USDC.png',
	priceFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000'
} as unknown as PythToken;

export const ARBITRUM_SFT_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_cm153vmqi5gke01vy66p4ftzf/subgraphs/sft-offchainassetvaulttest-arbitrum-one/1.0.1/gn';
export const ARBITRUM_ORDERBOOK_SUBGRAPH_URL =
	'https://api.goldsky.com/api/public/project_clv14x04y9kzi01saerx7bxpg/subgraphs/ob4-arbitrum-one/2025-06-04-f5a5/gn';
export const TARGET_NETWORK = 'arbitrum2';
export const TARGET_NETWORK_EXPLORER_URL = 'https://arbiscan.io';
export const SFT_EXPLORER_URL = 'https://stox.h20.market';

export const STOXs: PythToken[] = [
	{
		chainId: arbitrum.id,
		address: '0x6F69D14e0d7e736510A6F1499255F8Ba3b4A951b',
		symbol: 'TSTOX',
		decimals: 18,
		name: 'Test St0x',
		logoUrl: '/images/TSTOX.png',
		priceFeedId: '0x0000000000000000000000000000000000000000000000000000000000000000'
	} as unknown as PythToken,
	{
		chainId: arbitrum.id,
		address: '0x294afcc97cc03bd7e4dccf4addf2a1497d96d454',
		symbol: 'AAPLs1',
		decimals: 18,
		name: 'STx Apple 01',
		logoUrl: '/images/AAPL.png',
		priceFeedId: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688'
	} as unknown as PythToken,
	{
		chainId: arbitrum.id,
		address: '0x2e93b2c6cb3ac1b9993e784686c5637de28c2c2a',
		symbol: 'AMZNs1',
		decimals: 18,
		name: 'STx Amazon 01',
		logoUrl: '/images/AMZN.png',
		priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a'
	} as unknown as PythToken,
	{
		chainId: arbitrum.id,
		address: '0xaca45fea0049823e809f0e789144c21d96230996',
		symbol: 'GOOGLs1',
		decimals: 18,
		name: 'STx Alphabet 01',
		logoUrl: '/images/GOOGL.png',
		priceFeedId: '0x5a48c03e9b9cb337801073ed9d166817473697efff0d138874e0f6a33d6d5aa6'
	} as unknown as PythToken,
	{
		chainId: arbitrum.id,
		address: '0x52946181fe3e3ab967a52f7294fa1cd39ae882e9',
		symbol: 'METAs1',
		decimals: 18,
		name: 'STx Meta 01',
		logoUrl: '/images/META.png',
		priceFeedId: '0x78a3e3b8e676a8f73c439f5d749737034b139bbbe899ba5775216fba596607fe'
	} as unknown as PythToken,
	{
		chainId: arbitrum.id,
		address: '0x20c40dd9e905482e6bc7c06de3383104746b7928',
		symbol: 'MSFTs1',
		decimals: 18,
		name: 'STx Microsoft 01',
		logoUrl: '/images/MSFT.png',
		priceFeedId: '0xd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1'
	} as unknown as PythToken,
	{
		chainId: arbitrum.id,
		address: '0x6696E32EbD293783bCb4b4f157Da02A65789e38e',
		symbol: 'TSLAs1',
		decimals: 18,
		name: 'STx Tesla 01',
		logoUrl: '/images/TSLA.png',
		priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1'
	} as unknown as PythToken,
	{
		chainId: arbitrum.id,
		address: '0x5191aF5069923b4AA2120f456ADbACF4d7Cf2a87',
		symbol: 'NVDAs1',
		decimals: 18,
		name: 'STx Nvidia 01',
		logoUrl: '/images/NVDA.png',
		priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593'
	} as unknown as PythToken
];

export const ETFs: Token[] = [
	{
		chainId: arbitrum.id,
		address: '0x294afcc97cc03bd7e4dccf4addf2a1497d96d454',
		symbol: 'AAPLs1',
		decimals: 18,
		name: 'STx Apple 01',
		logoUrl: '/images/AAPL.png',
		priceFeedId: '0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688'
	} as unknown as PythToken
];

export const ST0NX: PythToken[] = [
	{
		chainId: arbitrum.id,
		address: '0x2e93b2c6cb3ac1b9993e784686c5637de28c2c2a',
		symbol: 'AMZNs1',
		decimals: 18,
		name: 'STx Amazon 01',
		logoUrl: '/images/AMZN.png',
		priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a'
	} as unknown as PythToken
];
