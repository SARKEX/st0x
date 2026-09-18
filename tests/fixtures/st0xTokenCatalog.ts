import type { CategorizedToken } from '../../src/lib/config/tokens';

const assets = [
	{
		symbol: 'IAU',
		address: '0x1E46d7eFef64A833AFB1CD49299a7AD5B439f4d8',
		unwrappedAddress: '0x9a507314ea2a6c5686c0d07bfecb764dcf324dff',
		legacyAddress: '0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397',
		name: 'Wrapped iShares Gold Trust ST0x',
		market: 'AMEX'
	},
	{
		symbol: 'NVDA',
		address: '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7',
		unwrappedAddress: '0x7271a3c91bb6070ed09333b84a815949d4f16d14',
		legacyAddress: '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b',
		name: 'Wrapped NVIDIA Corporation ST0x',
		market: 'NASDAQ'
	},
	{
		symbol: 'AMZN',
		address: '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53',
		unwrappedAddress: '0x466cb2e46fa1afc0ab5e22274b34d0391db18efd',
		legacyAddress: '0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea',
		name: 'Wrapped Amazon.com Inc ST0x',
		market: 'NASDAQ'
	},
	{
		symbol: 'TSLA',
		address: '0x219A8d384a10BF19b9f24cB5cC53F79Dd0e5A03D',
		unwrappedAddress: '0x4e169cd2ab4f82640a8c65c68fed55863866fdb0',
		legacyAddress: '0x470b06815a2e286df8c38c9c73280e0760088623',
		name: 'Wrapped Tesla Inc ST0x',
		market: 'NASDAQ'
	},
	{
		symbol: 'MSTR',
		address: '0xFF05E1bD696900dc6A52CA35Ca61Bb1024eDa8e2',
		unwrappedAddress: '0x013b782f402d61aa1004cca95b9f5bb402c9d5fe',
		legacyAddress: '0xff647ad8c4b065bd746911bb9ea1a33c38c63604',
		name: 'Wrapped MicroStrategy Incorporated ST0x',
		market: 'NASDAQ'
	},
	{
		symbol: 'COIN',
		address: '0x5cDa0E1CA4ce2af96315f7F8963C85399c172204',
		unwrappedAddress: '0x626757e6f50675d17fcad312e82f989ae7a23d38',
		legacyAddress: '0xb616f8b391d1adc118fd7e4063526d5530d49b10',
		name: 'Wrapped Coinbase Global Inc ST0x',
		market: 'NASDAQ'
	},
	{
		symbol: 'SPYM',
		address: '0x31C2C14134e6E3B7ef9478297F199331133Fc2d8',
		unwrappedAddress: '0x8fdf41116f755771bfe0747d5f8c3711d5debfbb',
		legacyAddress: '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
		name: 'Wrapped SPDR Portfolio S&P 500 ETF ST0x',
		market: 'AMEX',
		legacySymbol: 'tSPYM',
		previousSymbols: ['wtSPLG', 'tSPLG']
	}
] as const;

export const TEST_ST0X_TOKENS: CategorizedToken[] = assets.map((asset, index) => ({
	chainId: 8453,
	address: asset.address,
	unwrappedAddress: asset.unwrappedAddress,
	legacyAddress: asset.legacyAddress,
	migrationOrderHash: `0x${String(index + 1).padStart(64, '0')}`,
	symbol: `wt${asset.symbol}`,
	legacySymbol: 'legacySymbol' in asset ? asset.legacySymbol : undefined,
	previousSymbols: 'previousSymbols' in asset ? [...asset.previousSymbols] : undefined,
	decimals: 18,
	name: asset.name,
	logoUrl: `https://example.com/${asset.symbol}.png`,
	priceFeedId: `0x${String(index + 1).padStart(64, '0')}`,
	category: 'ST0x',
	tradingViewSymbol: `${asset.market}:${asset.symbol}`,
	tradingViewMarket: 'america'
}));

export const TEST_CRYPTO_TOKENS: CategorizedToken[] = [
	{
		chainId: 8453,
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		category: 'CRYPTO',
		paymentToken: true
	}
];
