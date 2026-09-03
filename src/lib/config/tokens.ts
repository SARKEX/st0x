import { arbitrum, base } from '@wagmi/core/chains';
import type { Token } from '$lib/types';

export const PAYMENT_TOKENS_BY_NETWORK: Record<number, Token[]> = {
	8453: [
		{
			chainId: 8453,
			address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
			symbol: 'USDC',
			decimals: 6,
			name: 'USD Coin',
			logoUrl: '/images/USDC.png'
		}
	]
};

export const DEFAULT_PAYMENT_TOKENS: Record<number, Token> = Object.fromEntries(
	Object.entries(PAYMENT_TOKENS_BY_NETWORK).map(([chainId, tokens]) => [
		Number(chainId),
		tokens[0] as Token
	])
);

export function getPaymentTokensForNetwork(chainId: number): Token[] {
	return PAYMENT_TOKENS_BY_NETWORK[chainId] ?? [];
}

export function getDefaultPaymentTokenForNetwork(chainId: number): Token | undefined {
	const [first] = getPaymentTokensForNetwork(chainId);
	return first;
}

export type TokenCategory = 'ST0x' | 'CRYPTO';

export interface LimitOrder {
	orderHash: string;
	type: 'Buy' | 'Sell';
}

export interface CategorizedToken extends Token {
	category: TokenCategory;
	tradingViewSymbol?: string;
	tradingViewMarket?: string;
	limitOrders?: LimitOrder[];
	// Token address variants for ST0x tokens
	unwrappedAddress?: string; // Underlying ERC4626 asset (tNVDA)
	legacyAddress?: string; // Old token for migration (optional)
	legacySymbol?: string; // Old symbol if different (e.g., tSPLG -> wtSPYM)
	previousSymbols?: string[]; // Historical symbol names for blob storage lookups
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
		logoUrl: '/images/ishares.png',
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
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:SPYM',
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
		logoUrl: '/images/invesco.png',
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
		logoUrl: '/images/vanguard.png',
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
		category: 'ST0x',
		tradingViewSymbol: 'AMEX:ARKK',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		// wtSGOV — iShares 0-3 Month Treasury Bond ETF. Added via st0x.registry
		// PR #22 (ST0x-Technology/st0x.registry). This is the first ST0x wrapper
		// expected to develop a non-1:1 wrap ratio over time (T-bill yield
		// accrues into the vault, increasing assetsPerShare).
		chainId: base.id,
		address: '0x78c31580c97101694C70022c83D570150c11e935',
		unwrappedAddress: '0xc941C1506B7555Ba8C506Fb6c9b9CC259902d612',
		symbol: 'wtSGOV',
		decimals: 18,
		name: 'Wrapped iShares 0-3 Month Treasury Bond ETF ST0x',
		logoUrl: '/images/ishares.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:SGOV',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		// wtSPCX — Space Exploration Technologies Corp (SpaceX). Deployed on Base
		// 2026-06-10 ahead of the 2026-06-12 Nasdaq IPO (ticker SPCX, ISIN
		// US84615Q1031).
		chainId: base.id,
		address: '0x19F89aaEf8a93f38A974beca9776f09aB844887F',
		unwrappedAddress: '0xc585AeB8B76c5F5e4215470A7625258e86ED7746',
		symbol: 'wtSPCX',
		decimals: 18,
		name: 'Wrapped Space Exploration Technologies Corp. ST0x',
		logoUrl: '/images/SPCX.svg',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:SPCX',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x3aF952888Cd89DAD3e8AF67cf4b7E740B36829C3',
		unwrappedAddress: '0x9a5D3cAeC90b0332b18C0B93fEF42F3F8C918289',
		symbol: 'wtCEG',
		decimals: 18,
		name: 'Wrapped Constellation Energy Corporation ST0x',
		logoUrl: '/images/CEG.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:CEG',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x1A91Df4a970EBaB1bB4AF32Eb6d10509028eE4b8',
		unwrappedAddress: '0x96DE077262609298CD891E4Ab21bd34837dE33aB',
		symbol: 'wtDRAM',
		decimals: 18,
		name: 'Wrapped Roundhill Memory ETF ST0x',
		logoUrl: '/images/roundhill.png',
		category: 'ST0x',
		tradingViewSymbol: 'CBOE:DRAM',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x71C66449d2528E23514A9c197BFD55Ae9DB3B714',
		unwrappedAddress: '0x7001e2974F775f0Fd73a3D2e5914e591f3EC3fBB',
		symbol: 'wtTSM',
		decimals: 18,
		name: 'Wrapped Taiwan Semiconductor Manufacturing Company ST0x',
		logoUrl: '/images/TSM.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:TSM',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x8200c6d9AB9E02A25D7F2099244C476d99a085ef',
		unwrappedAddress: '0x722Cb373f1871A176fb5DC3953046f2EAE22F619',
		symbol: 'wtASML',
		decimals: 18,
		name: 'Wrapped ASML Holding N.V. ST0x',
		logoUrl: '/images/ASML.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:ASML',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xFcD17aC4c4BF6a72c93018096F3fC09e66573Ff9',
		unwrappedAddress: '0x4DBA41f0feb390F208a85e96168fF5d8aC2b6F5c',
		symbol: 'wtSKHY',
		decimals: 18,
		name: 'Wrapped SK hynix Inc. ADR ST0x',
		logoUrl: '/images/SKHY.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:SKHY',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x89EcfE9E0728D6b3c5eb0EE7236f8C6F806C7B56',
		unwrappedAddress: '0x7d89a2DFfDaF9f48A64337C725D925381b431aE2',
		symbol: 'wtMU',
		decimals: 18,
		name: 'Wrapped Micron Technology, Inc. ST0x',
		logoUrl: '/images/MU.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:MU',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x648042Acd8638E12fEfd51C2b25A9f993f21a612',
		unwrappedAddress: '0x50b5225409A55B873fD6C2Fd5880AF5a11acE9b1',
		symbol: 'wtAMD',
		decimals: 18,
		name: 'Wrapped Advanced Micro Devices, Inc. ST0x',
		logoUrl: '/images/AMD.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:AMD',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x70A182f481AEF05836666B6CfDbe84dCBCE8AC19',
		unwrappedAddress: '0x6088F8ef741AE1f5A61882866f130631b41617E2',
		symbol: 'wtAVGO',
		decimals: 18,
		name: 'Wrapped Broadcom Inc. ST0x',
		logoUrl: '/images/AVGO.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:AVGO',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x522DC65c89C9Af4f410BAe01bbf53aF75854a9f9',
		unwrappedAddress: '0x98C02B58b7E65EF5a4262d9536162949e3B2E141',
		symbol: 'wtAMAT',
		decimals: 18,
		name: 'Wrapped Applied Materials, Inc. ST0x',
		logoUrl: '/images/AMAT.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:AMAT',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x328B9aFFa511fE26673edBb4fEa37eDaF908A3bc',
		unwrappedAddress: '0xDdE9346107609A05439A0B59Ab6eD4f7F81a1FBF',
		symbol: 'wtLRCX',
		decimals: 18,
		name: 'Wrapped Lam Research Corporation ST0x',
		logoUrl: '/images/LRCX.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:LRCX',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x045Fb493D970f94a54FeaF931033622fC82192e6',
		unwrappedAddress: '0x1a29eD11DF8295D5F3B5F59849FD94caD615E024',
		symbol: 'wtTTWO',
		decimals: 18,
		name: 'Wrapped Take-Two Interactive Software, Inc. ST0x',
		logoUrl: '/images/TTWO.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:TTWO',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x6a2357Df4975C667B171bE53dA6FFe6deBf7030c',
		unwrappedAddress: '0x15De944Cd020A18C8E5626fB0F81b36e73956199',
		symbol: 'wtGOOGL',
		decimals: 18,
		name: 'Wrapped Alphabet Inc. Class A ST0x',
		logoUrl: '/images/GOOGL.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:GOOGL',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xf567652fC2d7Db8D5469fD06AEbe8C9c4372d722',
		unwrappedAddress: '0xBDC237Aa3B67cC3088adAf117913F30Bf08157a3',
		symbol: 'wtINTC',
		decimals: 18,
		name: 'Wrapped Intel Corporation ST0x',
		logoUrl: '/images/INTC.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:INTC',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x1020EC8Aa3f709a1f3D8705cdBa89b950451bd88',
		unwrappedAddress: '0xD36056a4a03707D3743fCE4e9C08852820ADcfdC',
		symbol: 'wtAAPL',
		decimals: 18,
		name: 'Wrapped Apple Inc. ST0x',
		logoUrl: '/images/AAPL.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:AAPL',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x515A3Ac2a6aB590bDFa970caFFFd7fAdC680886E',
		unwrappedAddress: '0x6a071E25fa25653cF15d1ee320eA3df771926Aa0',
		symbol: 'wtMSFT',
		decimals: 18,
		name: 'Wrapped Microsoft Corporation ST0x',
		logoUrl: '/images/MSFT.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:MSFT',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x892CcF5E75f4a7Ee6402971a1587F65BEE4d52bd',
		unwrappedAddress: '0xA41Ce7B8255A01062ED1AF23ea5E8137B9300554',
		symbol: 'wtLLY',
		decimals: 18,
		name: 'Wrapped Eli Lilly and Company ST0x',
		logoUrl: '/images/LLY.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:LLY',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xb6D779A79E7493ed821a65D52bA419F0F6D5dD0a',
		unwrappedAddress: '0xb6021810971714cD48572af527307Acc324ecF61',
		symbol: 'wtPTY',
		decimals: 18,
		name: 'Wrapped PIMCO Corporate & Income Opportunity Fund ST0x',
		logoUrl: '/images/PTY.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:PTY',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xd50f561322fe3235DBc9Ec8b3aB7693383d8A425',
		unwrappedAddress: '0x5cEfd886dD05001c2Fc32c313E05360D07f37d8f',
		symbol: 'wtHOOD',
		decimals: 18,
		name: 'Wrapped Robinhood Markets, Inc. ST0x',
		logoUrl: '/images/HOOD.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:HOOD',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xCB9571aB96aA47374eF30D8E9ACCC1cD51064726',
		unwrappedAddress: '0x57573351f3fdD20a57dEE4a7f836de1cE9900d4B',
		symbol: 'wtORCL',
		decimals: 18,
		name: 'Wrapped Oracle Corporation ST0x',
		logoUrl: '/images/ORCL.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:ORCL',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0xA759FAbbD866e6DB8bF76613C35825dC2e380bf0',
		unwrappedAddress: '0x8518931497d2A8f07Bc607D1D3295b398D065A65',
		symbol: 'wtSMCI',
		decimals: 18,
		name: 'Wrapped Super Micro Computer, Inc. ST0x',
		logoUrl: '/images/SMCI.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:SMCI',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x7e5cc7eAe0455A07Ab4abf354E0f5657BA2888BD',
		unwrappedAddress: '0x6B8fa7288dBEc7C1c62BfE59Cbd7Bec7EBF846C5',
		symbol: 'wtBABA',
		decimals: 18,
		name: 'Wrapped Alibaba Group Holding Limited ADR ST0x',
		logoUrl: '/images/BABA.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:BABA',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x295e9eCAb319006900a53b3f8D6Fcb0C131F4ada',
		unwrappedAddress: '0xcA1A378F9a250131A2fE51c10f120FeF7EDCa56E',
		symbol: 'wtTQQQ',
		decimals: 18,
		name: 'Wrapped ProShares UltraPro QQQ ST0x',
		logoUrl: '/images/TQQQ.png',
		category: 'ST0x',
		tradingViewSymbol: 'NASDAQ:TQQQ',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x0883f32d23Ed5535057a4B5E3eB1970FE08606AF',
		unwrappedAddress: '0x88C3F4E2E0a977Fed97ed246c70BFD7A01070246',
		symbol: 'wtNKE',
		decimals: 18,
		name: 'Wrapped NIKE, Inc. ST0x',
		logoUrl: '/images/NKE.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:NKE',
		tradingViewMarket: 'america',
		limitOrders: []
	},
	{
		chainId: base.id,
		address: '0x7ecAE30Ed8ee4F72653ada7b0941bDE7a0a8eE8d',
		unwrappedAddress: '0x6363657E19A82ABE0E210e9b8c88Ea61d96eceaB',
		symbol: 'wtMCD',
		decimals: 18,
		name: "Wrapped McDonald's Corporation ST0x",
		logoUrl: '/images/MCD.png',
		category: 'ST0x',
		tradingViewSymbol: 'NYSE:MCD',
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
