/**
 * Shared scaffolding for replay-*.test.ts files. Each test file mocks the
 * chain side via vi.hoisted (mirrors tests/lib/services/marketOrderExecution.test.ts:11-76)
 * and drives executeMarketOrder per scenario. The mocks themselves cannot be
 * declared in a shared module (vi.hoisted is per-test-file), so this module
 * only exports test-side data/builders.
 */
import { Float } from '@rainlanguage/float';
import type { ProcessedQuote } from '$lib/utils/orderbook';

export const ASSET_ADDR = '0x2222222222222222222222222222222222222222';
export const PAYMENT_ADDR = '0x1111111111111111111111111111111111111111';
export const ONE_FLOAT_HEX = Float.parse('1').value!.asHex();
export const POINT_FOUR_FLOAT_HEX = Float.parse('0.4').value!.asHex();

export function buildHydratedQuote(
	orderHash: string,
	side: 'ask' | 'bid' = 'ask'
): ProcessedQuote {
	return {
		orderHash,
		maxOutput: POINT_FOUR_FLOAT_HEX,
		ratio: ONE_FLOAT_HEX,
		inputTokenSymbol: side === 'ask' ? 'USDC' : 'tNVDA',
		outputTokenSymbol: side === 'ask' ? 'tNVDA' : 'USDC',
		inputTokenAddress: side === 'ask' ? PAYMENT_ADDR : ASSET_ADDR,
		outputTokenAddress: side === 'ask' ? ASSET_ADDR : PAYMENT_ADDR,
		inputIOIndex: 0,
		outputIOIndex: 0,
		inputTokenDecimals: side === 'ask' ? 6 : 18,
		outputTokenDecimals: side === 'ask' ? 18 : 6,
		side,
		quotePerAsset: 1,
		orderData: {
			owner: '0xc000000000000000000000000000000000000000',
			evaluable: {
				interpreter: '0xd000000000000000000000000000000000000000',
				store: '0xe000000000000000000000000000000000000000',
				bytecode: '0x'
			},
			validInputs: [{ token: PAYMENT_ADDR, vaultId: '0x0' }],
			validOutputs: [{ token: ASSET_ADDR, vaultId: '0x0' }],
			nonce: '0x0'
		} as unknown as ProcessedQuote['orderData'],
		sgOrder: {
			orderHash,
			orderBytes: '0xdeadbeef',
			owner: '0xc000000000000000000000000000000000000000'
		} as unknown as ProcessedQuote['sgOrder'],
		raindexOrder: { mockOrderHash: orderHash } as unknown as ProcessedQuote['raindexOrder']
	};
}

/**
 * Quote with no orderData/sgOrder — forces the hydration code path.
 */
export function buildUnhydratedQuote(
	orderHash: string,
	side: 'ask' | 'bid' = 'ask'
): ProcessedQuote {
	return {
		orderHash,
		maxOutput: POINT_FOUR_FLOAT_HEX,
		ratio: ONE_FLOAT_HEX,
		inputTokenSymbol: side === 'ask' ? 'USDC' : 'tNVDA',
		outputTokenSymbol: side === 'ask' ? 'tNVDA' : 'USDC',
		inputTokenAddress: side === 'ask' ? PAYMENT_ADDR : ASSET_ADDR,
		outputTokenAddress: side === 'ask' ? ASSET_ADDR : PAYMENT_ADDR,
		inputIOIndex: 0,
		outputIOIndex: 0,
		inputTokenDecimals: side === 'ask' ? 6 : 18,
		outputTokenDecimals: side === 'ask' ? 18 : 6,
		side,
		quotePerAsset: 1
	};
}

export const STD_NETWORK = {
	id: 8453,
	name: 'base',
	rpcUrls: { default: { http: ['https://example.com'] } }
};

export const STD_TOKENS = {
	assetToken: { address: ASSET_ADDR, decimals: 18, symbol: 'tNVDA' },
	paymentToken: { address: PAYMENT_ADDR, decimals: 6, symbol: 'USDC' }
};
