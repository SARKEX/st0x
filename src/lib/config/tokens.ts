import { arbitrum, base } from '@wagmi/core/chains';
import type { PythToken } from '$lib/types';

export const PAYMENT_TOKENS_BY_NETWORK: Record<number, PythToken[]> = {
	8453: [
		{
			chainId: 8453,
			address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
			symbol: 'USDC',
			decimals: 6,
			name: 'USD Coin',
			logoUrl: '/images/USDC.png',
			priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a'
		} as PythToken
	]
};

export const DEFAULT_PAYMENT_TOKENS: Record<number, PythToken> = Object.fromEntries(
	Object.entries(PAYMENT_TOKENS_BY_NETWORK).map(([chainId, tokens]) => [
		Number(chainId),
		tokens[0] as PythToken
	])
);

export function getPaymentTokensForNetwork(chainId: number): PythToken[] {
	return PAYMENT_TOKENS_BY_NETWORK[chainId] ?? [];
}

export function getDefaultPaymentTokenForNetwork(chainId: number): PythToken | undefined {
	const [first] = getPaymentTokensForNetwork(chainId);
	return first;
}

export type TokenCategory = 'ST0x' | 'CRYPTO';

export interface LimitOrder {
	orderHash: string;
	type: 'Buy' | 'Sell';
}

export interface CategorizedToken extends PythToken {
	category: TokenCategory;
	logoUrl?: string;
	tradingViewSymbol?: string;
	tradingViewMarket?: string;
	limitOrders?: LimitOrder[];
	// Token address variants for ST0x tokens
	unwrappedAddress?: string; // Underlying ERC4626 asset (tNVDA)
	legacyAddress?: string; // Old token for migration (optional)
	legacySymbol?: string; // Old symbol if different (e.g., tSPLG -> wtSPYM)
	previousSymbols?: string[]; // Historical symbol names for blob storage lookups
	// Temporary hardcoded price fallback for tokens whose Pyth feed is unavailable.
	// Used by the snapshot pipeline when priceFeedId is empty. Remove once a real feed is wired up.
	fallbackPrice?: number;
}

export const TOKENS: CategorizedToken[] = [
	{
		chainId: base.id,
		address: '0xFb5B41acdbA20a3230F84BE995173CFb98b8D6E7',
		unwrappedAddress: '0x7271a3c91bb6070ed09333b84a815949d4f16d14',
		legacyAddress: '0x69fca9f7fad46a7eef3acef5beac9df5b7eca73b',
		symbol: 'wtNVDA',
		decimals: 18,
		name: 'Wrapped NVIDIA Corporation ST0x',
		logoUrl: '/images/NVDA.png',
		priceFeedId: '0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:NVDA',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x997baE3EC193a249596d3708C3fAB7C501Bb8a53',
		unwrappedAddress: '0x466cb2e46fa1afc0ab5e22274b34d0391db18efd',
		legacyAddress: '0x8d8c315db61f60dcc3c66cdb48ca87fc643e35ea',
		symbol: 'wtAMZN',
		decimals: 18,
		name: 'Wrapped Amazon.com Inc ST0x',
		logoUrl: '/images/AMZN.png',
		priceFeedId: '0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:AMZN',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x219A8d384a10BF19b9f24cB5cC53F79Dd0e5A03D',
		unwrappedAddress: '0x4e169cd2ab4f82640a8c65c68fed55863866fdb0',
		legacyAddress: '0x470b06815a2e286df8c38c9c73280e0760088623',
		symbol: 'wtTSLA',
		decimals: 18,
		name: 'Wrapped Tesla Inc ST0x',
		logoUrl: '/images/TSLA.png',
		priceFeedId: '0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:TSLA',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xFF05E1bD696900dc6A52CA35Ca61Bb1024eDa8e2',
		unwrappedAddress: '0x013b782f402d61aa1004cca95b9f5bb402c9d5fe',
		legacyAddress: '0xff647ad8c4b065bd746911bb9ea1a33c38c63604',
		symbol: 'wtMSTR',
		decimals: 18,
		name: 'Wrapped MicroStrategy Incorporated ST0x',
		logoUrl: '/images/MSTR.png',
		priceFeedId: '0xe1e80251e5f5184f2195008382538e847fafc36f751896889dd3d1b1f6111f09',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:MSTR',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x1E46d7eFef64A833AFB1CD49299a7AD5B439f4d8',
		unwrappedAddress: '0x9a507314ea2a6c5686c0d07bfecb764dcf324dff',
		legacyAddress: '0xd0a90b7c9ae5facbe09ca4c576a3795eda53b397',
		symbol: 'wtIAU',
		decimals: 18,
		name: 'Wrapped iShares Gold Trust ST0x',
		logoUrl: '/images/IAU.png',
		priceFeedId: '0xf703fbded84f7da4bd9ff4661b5d1ffefa8a9c90b7fa12f247edc8251efac914',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:IAU',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x5cDa0E1CA4ce2af96315f7F8963C85399c172204',
		unwrappedAddress: '0x626757e6f50675d17fcad312e82f989ae7a23d38',
		legacyAddress: '0xb616f8b391d1adc118fd7e4063526d5530d49b10',
		symbol: 'wtCOIN',
		decimals: 18,
		name: 'Wrapped Coinbase Global Inc ST0x',
		logoUrl: '/images/COIN.png',
		priceFeedId: '0xfee33f2a978bf32dd6b662b65ba8083c6773b494f8401194ec1870c640860245',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:COIN',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x31C2C14134e6E3B7ef9478297F199331133Fc2d8',
		unwrappedAddress: '0x8fdf41116f755771bfe0747d5f8c3711d5debfbb',
		legacyAddress: '0x2289249984f1fa2ce86c4e8867e7eb819ea7df95',
		legacySymbol: 'tSPYM', // Symbol changed from SPLG to SPYM
		previousSymbols: ['wtSPLG', 'tSPLG'], // Historical blob storage names
		symbol: 'wtSPYM',
		decimals: 18,
		name: 'Wrapped SPDR Portfolio S&P 500 ETF ST0x',
		logoUrl: '/images/state_street.png',
		priceFeedId: '',
		// priceFeedId removed — Pyth no longer supports this feed ID.
		// Using a hardcoded fallback until a replacement feed is wired up.
		fallbackPrice: 82.5,
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:SPLG',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	// wtSTOX token temporarily disabled
	// {
	// 	chainId: base.id,
	// 	address: '0xf3da872A3B8e674A8925c67c866b2a4a67a1fC8a',
	// 	unwrappedAddress: '0x9e0052b62ff6ce9055b33996a1dee768041b1f67',
	// 	legacyAddress: '0xcf877a4f3ebec00c5b070cccb0a6a0583afbcd88',
	// 	// legacySymbol: 'tSTOX',
	// 	symbol: 'wtSTOX',
	// 	decimals: 18,
	// 	name: 'Wrapped SPDR Portfolio S&P 500 ETF ST0x',
	// 	logoUrl: '/images/state_street.png',
	// 	priceFeedId: '0x54e2e127c93950de5a710100fd1cd387aba1ec8920850efdb05da5fee57d2e32',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'AMEX:SPLG',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// },
	{
		chainId: base.id,
		address: '0xEB7F3E4093C9d68253b6104FbbfF561F3eC0442F',
		unwrappedAddress: '0x58ce5024b89b4f73c27814c0f0abbea331c99be8',
		legacyAddress: '0x826a85de1f7b70f4c7450c0f882a6db06000ed80',
		symbol: 'wtSIVR',
		decimals: 18,
		name: 'Wrapped abrdn Physical Silver Shares ETF ST0x',
		logoUrl: '/images/abrdn.png',
		priceFeedId: '0x0a5ee42b0f7287a777926d08bc185a6a60f42f40a9b63d78d85d4a03ee2e3737',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:SIVR',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x8AFba81DEc38DE0A18E2Df5E1967a7493651eebf',
		unwrappedAddress: '0x38eb797892ed71da69bdc27a456a7c83ff813b52',
		legacyAddress: '0x43422a9d11a6640ef0d5f65292ef8adf87cf8522',
		symbol: 'wtCRCL',
		decimals: 18,
		name: 'Wrapped Circle Internet Group Inc ST0x',
		logoUrl: '/images/CRCL.png',
		priceFeedId: '0x92b8527aabe59ea2b12230f7b532769b133ffb118dfbd48ff676f14b273f1365',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:CRCL',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x2512EC661f0bA089c275EA105E31bAD6FcFcf319',
		unwrappedAddress: '0xfbde45df60249203b12148452fc77c3b5f811eb2',
		legacyAddress: '0xf8fdfd6a686346d34b3143fc23072aa45c9e8386',
		symbol: 'wtBMNR',
		decimals: 18,
		name: 'Wrapped Bitmine Immersion Technologies, Inc ST0x',
		logoUrl: '/images/BMNR.png',
		priceFeedId: '0x54e2e127c93950de5a710100fd1cd387aba1ec8920850efdb05da5fee57d2e32',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:BMNR',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x82f5BAEE1076334357a34A19E04f7c282D51cE47',
		unwrappedAddress: '0x1f17523b147ccc2a2328c0f014f6d49c479ea063',
		legacyAddress: '0x6192539a2036c786aba3ca6a2222ff7a0f9c287e',
		symbol: 'wtPPLT',
		decimals: 18,
		name: 'Wrapped abrdn Physical Platinum Shares ETF ST0x',
		logoUrl: '/images/abrdn.png',
		priceFeedId: '0x782410278b6c8aa2d437812281526012808404aa14c243f73fb9939eeb88d430',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:PPLT',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x823FF7Bbde2869aAe73A6CD53e7f614442836757',
		unwrappedAddress: '0x09ee803ba675052e10a54bfc8e18c0f67793056b',
		symbol: 'wtQQQM',
		decimals: 18,
		name: 'Wrapped Invesco NASDAQ 100 ETF ST0x',
		logoUrl: '/images/QQQM.png',
		priceFeedId: '0x433b196b3b026f46f76b5e901c84c575a7280dcba0f4272edefe0529b599ad64',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:QQQM',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x23ec6886b49D7ab123E9ee8e474D2fa7AB6Cbc2d',
		unwrappedAddress: '0x0acfea6833c4a3f41bf2fbd736aa9eea547d90ee',
		symbol: 'wtVWO',
		decimals: 18,
		name: 'Wrapped Vanguard Emerging Markets Stock Index Fund ST0x',
		logoUrl: '/images/VWO.png',
		priceFeedId: '0x2f91d775954c0c828d4563448d253cf09df218b620825242775d878d1d5956c7',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:VWO',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x9FfF48B4535AF3765Ac9E1b164720EDc01DF8EE7',
		unwrappedAddress: '0x323804af6f3bb463d688b854667c6870a0fc06ad',
		symbol: 'wtARKK',
		decimals: 18,
		name: 'Wrapped ARK Innovation ETF ST0x',
		logoUrl: '/images/ARKK.png',
		priceFeedId: '0xb2fe0af6c828efefda3ffda664f919825a535aa28a0f19fc238945c7aff540b1',
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:ARKK',
		tradingViewMarket: 'america',
		limitOrders: []
	}
	// {
	// 	chainId: base.id,
	// 	address: '0xF4f8c66085910d583c01f3b4e44Bf731D4e2c565',
	// 	unwrappedAddress: '0xf6744fd94e27c2f58f6110aa9fdc77a87e41766b',
	// 	// No legacy address - wtRKLB is a new token
	// 	symbol: 'wtRKLB',
	// 	decimals: 18,
	// 	name: 'Wrapped Rocket Lab USA Inc ST0x',
	// 	logoUrl: '/images/RKLB.png',
	// 	priceFeedId: '0x40589e289317e4fbd997b1a267606e20a1cc7c3e4689f9e5a5992957917816c8',
	// 	category: 'ST0x',
	// 	tradingViewSymbol: 'NASDAQ:RKLB',
	// 	tradingViewMarket: 'america',
	// 	limitOrders: []
	// }
];

export const CRYPTO_TOKENS: CategorizedToken[] = [
	{
		chainId: arbitrum.id,
		address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		symbol: 'WBTC',
		decimals: 18,
		name: 'Wrapped BTC',
		logoUrl: '/images/BTC.svg',
		priceFeedId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
		category: 'CRYPTO',
		tradingViewSymbol: 'BINANCE:BTCUSDT',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: arbitrum.id,
		address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
		symbol: 'WETH',
		decimals: 18,
		name: 'Wrapped Ether',
		logoUrl: '/images/ETH.svg',
		priceFeedId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
		category: 'CRYPTO',
		tradingViewSymbol: 'BINANCE:ETHUSDT',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: arbitrum.id,
		address: '0x912CE59144191C1204E64559FE8253a0e49E6548',
		symbol: 'ARB',
		decimals: 18,
		name: 'Arbitrum (ARB)',
		logoUrl: '/images/ARB.svg',
		priceFeedId: '0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5',
		category: 'CRYPTO',
		tradingViewSymbol: 'BINANCE:ARBUSDT',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: arbitrum.id,
		address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
		category: 'CRYPTO',
		tradingViewSymbol: 'KRAKEN:USDCUSD',
		tradingViewMarket: 'crypto'
	},
	{
		chainId: base.id,
		address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
		symbol: 'USDC',
		decimals: 6,
		name: 'USD Coin',
		logoUrl: '/images/USDC.png',
		priceFeedId: '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
		category: 'CRYPTO',
		tradingViewSymbol: 'KRAKEN:USDCUSD',
		tradingViewMarket: 'crypto'
	}
];

export function getAllTokens(): CategorizedToken[] {
	return TOKENS;
}

// Helper function to get tokens filtered by network chainId
export function getTokensByNetwork(chainId: number): CategorizedToken[] {
	return TOKENS.filter((token) => token.chainId === chainId);
}

export function getCryptoTokensByNetwork(chainId: number): CategorizedToken[] {
	return CRYPTO_TOKENS.filter((token) => token.chainId === chainId);
}

export function getAllTokensByNetwork(chainId: number): CategorizedToken[] {
	return [...getTokensByNetwork(chainId), ...getCryptoTokensByNetwork(chainId)];
}

// Address lookup maps (built once at module load)
const tokenByWrappedAddress = new Map(TOKENS.map((t) => [t.address.toLowerCase(), t]));

const tokenByUnwrappedAddress = new Map(
	TOKENS.filter((t) => t.unwrappedAddress).map((t) => [t.unwrappedAddress!.toLowerCase(), t])
);

const tokenByLegacyAddress = new Map(
	TOKENS.filter((t) => t.legacyAddress).map((t) => [t.legacyAddress!.toLowerCase(), t])
);

export function getTokenByWrappedAddress(address: string): CategorizedToken | null {
	return tokenByWrappedAddress.get(address.toLowerCase()) ?? null;
}

export function getTokenByUnwrappedAddress(address: string): CategorizedToken | null {
	return tokenByUnwrappedAddress.get(address.toLowerCase()) ?? null;
}

export function getTokenByLegacyAddress(address: string): CategorizedToken | null {
	return tokenByLegacyAddress.get(address.toLowerCase()) ?? null;
}

/**
 * Get a token by any of its addresses (wrapped, unwrapped, or legacy).
 * Useful for URL redirects and lookups where address type is unknown.
 */
export function getTokenByAnyAddress(address: string): CategorizedToken | null {
	const lowerAddress = address.toLowerCase();
	return (
		tokenByWrappedAddress.get(lowerAddress) ??
		tokenByUnwrappedAddress.get(lowerAddress) ??
		tokenByLegacyAddress.get(lowerAddress) ??
		null
	);
}

export function isWrappedTokenAddress(address: string): boolean {
	return tokenByWrappedAddress.has(address.toLowerCase());
}

export function isUnwrappedTokenAddress(address: string): boolean {
	return tokenByUnwrappedAddress.has(address.toLowerCase());
}

export function isLegacyTokenAddress(address: string): boolean {
	return tokenByLegacyAddress.has(address.toLowerCase());
}

export function getAllUnwrappedTokenAddresses(): string[] {
	return TOKENS.filter((t) => t.unwrappedAddress).map((t) => t.unwrappedAddress!);
}

export function getAllLegacyTokenAddresses(): string[] {
	return TOKENS.filter((t) => t.legacyAddress).map((t) => t.legacyAddress!);
}

/** Get all address variants (wrapped, unwrapped, legacy) for a single token, lowercased. */
export function getTokenAddressVariants(token: CategorizedToken): string[] {
	return [
		token.address,
		...(token.unwrappedAddress ? [token.unwrappedAddress] : []),
		...(token.legacyAddress ? [token.legacyAddress] : [])
	].map((a) => a.toLowerCase());
}

/** Get all token addresses across all tokens (wrapped + unwrapped + legacy), lowercased. */
export function getAllTokenAddressesFlat(): string[] {
	return TOKENS.flatMap((t) => getTokenAddressVariants(t));
}
