import { describe, it, expect } from 'vitest';
import {
	getUserTakerInfo,
	deriveMakerSide,
	makerToTakerTokens,
	takerToMakerTokens,
	getMakerInputTokenAddress,
	getMakerOutputTokenAddress,
	getMakerInputIOIndex,
	getMakerOutputIOIndex,
	type MinimalToken,
	type MakerOrderTokens
} from '$lib/types/orderPerspective';
import type { ProcessedQuote } from '$lib/utils/orderbook';

// Mock tokens for testing
const USDC: MinimalToken = {
	address: '0xUSDC',
	decimals: 6,
	symbol: 'USDC'
};

const ASSET: MinimalToken = {
	address: '0xASSET',
	decimals: 18,
	symbol: 'tSTOX'
};

describe('orderPerspective', () => {
	describe('getUserTakerInfo', () => {
		it('should correctly map Buy action to taker info', () => {
			const result = getUserTakerInfo('Buy', ASSET, USDC);

			expect(result.userAction).toBe('Buy');
			expect(result.takerWants).toEqual(ASSET);
			expect(result.takerPays).toEqual(USDC);
			expect(result.crossingSide).toBe('ask');
			expect(result.crossingDescription).toBe('Taking asks to buy asset');
		});

		it('should correctly map Sell action to taker info', () => {
			const result = getUserTakerInfo('Sell', ASSET, USDC);

			expect(result.userAction).toBe('Sell');
			expect(result.takerWants).toEqual(USDC);
			expect(result.takerPays).toEqual(ASSET);
			expect(result.crossingSide).toBe('bid');
			expect(result.crossingDescription).toBe('Taking bids to sell asset');
		});
	});

	describe('deriveMakerSide', () => {
		it('should return bid when payment token is OUTPUT (buying asset)', () => {
			// BID order: orderInput=asset, orderOutput=USDC
			const side = deriveMakerSide(ASSET, USDC, USDC);
			expect(side).toBe('bid');
		});

		it('should return ask when payment token is INPUT (selling asset)', () => {
			// ASK order: orderInput=USDC, orderOutput=asset
			const side = deriveMakerSide(USDC, ASSET, USDC);
			expect(side).toBe('ask');
		});

		it('should handle case-insensitive address comparison', () => {
			const usdcUpperCase = { ...USDC, address: '0xUSDC' };
			const usdcLowerCase = { ...USDC, address: '0xusdc' };

			const sideBid = deriveMakerSide(ASSET, usdcUpperCase, usdcLowerCase);
			expect(sideBid).toBe('bid');

			const sideAsk = deriveMakerSide(usdcUpperCase, ASSET, usdcLowerCase);
			expect(sideAsk).toBe('ask');
		});
	});

	describe('makerToTakerTokens', () => {
		it('should convert BID maker order to taker perspective', () => {
			// BID maker: input=asset (wants asset), output=USDC (gives USDC)
			const maker: MakerOrderTokens = {
				orderInputToken: ASSET,
				orderOutputToken: USDC
			};

			const taker = makerToTakerTokens(maker, USDC);

			// Taker would SELL asset to this BID maker
			expect(taker.takerWants).toEqual(USDC); // Taker wants USDC
			expect(taker.takerPays).toEqual(ASSET); // Taker pays asset
		});

		it('should convert ASK maker order to taker perspective', () => {
			// ASK maker: input=USDC (wants USDC), output=asset (gives asset)
			const maker: MakerOrderTokens = {
				orderInputToken: USDC,
				orderOutputToken: ASSET
			};

			const taker = makerToTakerTokens(maker, USDC);

			// Taker would BUY asset from this ASK maker
			expect(taker.takerWants).toEqual(ASSET); // Taker wants asset
			expect(taker.takerPays).toEqual(USDC); // Taker pays USDC
		});
	});

	describe('takerToMakerTokens', () => {
		it('should convert Buy taker to maker order tokens', () => {
			// Taker wants to BUY: wants asset, pays USDC
			const taker = {
				takerWants: ASSET,
				takerPays: USDC
			};

			const maker = takerToMakerTokens(taker);

			// Maker order that would satisfy this: input=asset, output=USDC (BID)
			expect(maker.orderInputToken).toEqual(ASSET);
			expect(maker.orderOutputToken).toEqual(USDC);
		});

		it('should convert Sell taker to maker order tokens', () => {
			// Taker wants to SELL: wants USDC, pays asset
			const taker = {
				takerWants: USDC,
				takerPays: ASSET
			};

			const maker = takerToMakerTokens(taker);

			// Maker order that would satisfy this: input=USDC, output=asset (ASK)
			expect(maker.orderInputToken).toEqual(USDC);
			expect(maker.orderOutputToken).toEqual(ASSET);
		});
	});

	describe('round-trip conversions', () => {
		it('should preserve tokens through makerToTaker -> takerToMaker', () => {
			const originalMaker: MakerOrderTokens = {
				orderInputToken: ASSET,
				orderOutputToken: USDC
			};

			const taker = makerToTakerTokens(originalMaker, USDC);
			const resultMaker = takerToMakerTokens(taker);

			// Note: The round-trip doesn't preserve the same maker order
			// because we're converting to the COUNTERPARTY perspective
			// BID maker (input=asset, output=USDC) -> Sell taker (wants=USDC, pays=asset)
			// -> ASK maker (input=USDC, output=asset)
			expect(resultMaker.orderInputToken).toEqual(USDC);
			expect(resultMaker.orderOutputToken).toEqual(ASSET);
		});
	});

	describe('integration: complete user flow', () => {
		it('should handle Buy user action end-to-end', () => {
			// User wants to BUY asset
			const takerInfo = getUserTakerInfo('Buy', ASSET, USDC);

			// User crosses ask orders (sellers)
			expect(takerInfo.crossingSide).toBe('ask');
			expect(takerInfo.takerWants).toEqual(ASSET);
			expect(takerInfo.takerPays).toEqual(USDC);

			// Convert to maker tokens to see what order would satisfy this
			const maker = takerToMakerTokens(takerInfo);

			// To satisfy a buy, taker needs orders with:
			// - orderInput: asset (order receives asset - what user wants!)
			// - orderOutput: USDC (order gives USDC - what user pays!)
			expect(maker.orderInputToken).toEqual(ASSET);
			expect(maker.orderOutputToken).toEqual(USDC);

			// This should be a BID order (payment token as output)
			const side = deriveMakerSide(maker.orderInputToken, maker.orderOutputToken, USDC);
			expect(side).toBe('bid');
		});

		it('should handle Sell user action end-to-end', () => {
			// User wants to SELL asset
			const takerInfo = getUserTakerInfo('Sell', ASSET, USDC);

			// User crosses bid orders (buyers)
			expect(takerInfo.crossingSide).toBe('bid');
			expect(takerInfo.takerWants).toEqual(USDC);
			expect(takerInfo.takerPays).toEqual(ASSET);

			// Convert to maker tokens to see what order would satisfy this
			const maker = takerToMakerTokens(takerInfo);

			// To satisfy a sell, taker needs orders with:
			// - orderInput: USDC (order receives USDC - what user wants!)
			// - orderOutput: asset (order gives asset - what user pays!)
			expect(maker.orderInputToken).toEqual(USDC);
			expect(maker.orderOutputToken).toEqual(ASSET);

			// This should be an ASK order (payment token as input)
			const side = deriveMakerSide(maker.orderInputToken, maker.orderOutputToken, USDC);
			expect(side).toBe('ask');
		});
	});

	describe('TRADE-01 accessor wrappers', () => {
		// Partial fixture — only the 4 fields the accessors read are populated.
		// The `as ProcessedQuote` cast is intentional; constructing a full
		// ProcessedQuote here would noise the test without strengthening the
		// assertion (the accessors are pure projections of these 4 fields).
		const quote = {
			inputTokenAddress: '0xAAaa1111111111111111111111111111111111aa',
			outputTokenAddress: '0xBBbb2222222222222222222222222222222222bb',
			inputIOIndex: 0,
			outputIOIndex: 1
		} as ProcessedQuote;

		it('getMakerInputTokenAddress returns inputTokenAddress', () => {
			expect(getMakerInputTokenAddress(quote)).toBe('0xAAaa1111111111111111111111111111111111aa');
		});

		it('getMakerOutputTokenAddress returns outputTokenAddress', () => {
			expect(getMakerOutputTokenAddress(quote)).toBe('0xBBbb2222222222222222222222222222222222bb');
		});

		it('getMakerInputIOIndex returns inputIOIndex', () => {
			expect(getMakerInputIOIndex(quote)).toBe(0);
		});

		it('getMakerOutputIOIndex returns outputIOIndex', () => {
			expect(getMakerOutputIOIndex(quote)).toBe(1);
		});

		it('accessors return primitive types (string for addresses, number for indices)', () => {
			expect(typeof getMakerInputTokenAddress(quote)).toBe('string');
			expect(typeof getMakerOutputTokenAddress(quote)).toBe('string');
			expect(typeof getMakerInputIOIndex(quote)).toBe('number');
			expect(typeof getMakerOutputIOIndex(quote)).toBe('number');
		});
	});
});
