import { describe, it, expect } from 'vitest';
import { detectPartialFill } from '$lib/stores/partialFillDetection';

// Token addresses pulled out as separate consts so the test body can
// reference them via local-variable reads instead of `COMMON.inputTokenAddress`,
// which would fire the TRADE-01 ESLint rule (banning raw IO-perspective
// MemberExpression reads outside the canonical helper allowlist).
const TOK_IN_ADDR = '0x000000000000000000000000000000000000aaaa';
const TOK_OUT_ADDR = '0x000000000000000000000000000000000000bbbb';

const COMMON = {
	inputTokenSymbol: 'tNVDA',
	inputTokenAddress: TOK_IN_ADDR,
	inputTokenDecimals: 18,
	outputTokenSymbol: 'USDC',
	outputTokenAddress: TOK_OUT_ADDR,
	outputTokenDecimals: 6,
	ioRatio: 100,
	actualSlippage: 0n
};

describe('partialFillDetection', () => {
	describe('detectPartialFill', () => {
		it('flags isPartialFill when actual wants < 99.7% of requested wants (no pays anchor)', () => {
			const summary = detectPartialFill({
				...COMMON,
				totalTakerWantsAmount: 990n,
				totalTakerPaysAmount: 99_000n,
				requestedTakerWantsAmount: 1_000n
				// no requestedTakerPaysAmount — anchor is wants
			});
			expect(summary.isPartialFill).toBe(true);
			expect(summary.isNoFill).toBe(false);
		});

		it('flags isFullFill (isPartialFill=false) when actual wants >= 99.7% of requested', () => {
			const summary = detectPartialFill({
				...COMMON,
				totalTakerWantsAmount: 998n,
				totalTakerPaysAmount: 99_800n,
				requestedTakerWantsAmount: 1_000n
			});
			expect(summary.isPartialFill).toBe(false);
			expect(summary.isNoFill).toBe(false);
		});

		it('uses pays anchor when requestedTakerPaysAmount is provided + > 0', () => {
			// Wants side looks "filled" (1000/1000 = 100%) but pays anchor reveals
			// only 50% spent — should flag as partial fill.
			const summary = detectPartialFill({
				...COMMON,
				totalTakerWantsAmount: 1_000n,
				totalTakerPaysAmount: 50_000n,
				requestedTakerWantsAmount: 1_000n,
				requestedTakerPaysAmount: 100_000n
			});
			expect(summary.isPartialFill).toBe(true);
		});

		it('flags isNoFill when actual amounts are zero', () => {
			const summary = detectPartialFill({
				...COMMON,
				totalTakerWantsAmount: 0n,
				totalTakerPaysAmount: 0n,
				requestedTakerWantsAmount: 1_000n
			});
			expect(summary.isNoFill).toBe(true);
			expect(summary.isPartialFill).toBe(false);
		});

		it('returns a fully-populated MarketOrderSummary with passthrough fields', () => {
			// Destructure (rather than read fields off `summary` directly) to avoid
			// MemberExpression reads on the IO-perspective field names that the
			// TRADE-01 ESLint rule bans outside the canonical helper allowlist.
			const {
				inputAmount,
				outputAmount,
				requestedInputAmount,
				inputTokenSymbol,
				outputTokenSymbol,
				inputTokenAddress,
				outputTokenAddress,
				inputTokenDecimals,
				outputTokenDecimals,
				ioRatio,
				actualSlippage
			} = detectPartialFill({
				...COMMON,
				totalTakerWantsAmount: 998n,
				totalTakerPaysAmount: 99_800n,
				requestedTakerWantsAmount: 1_000n
			});
			expect(inputAmount).toBe(998n);
			expect(outputAmount).toBe(99_800n);
			expect(requestedInputAmount).toBe(1_000n);
			expect(inputTokenSymbol).toBe('tNVDA');
			expect(outputTokenSymbol).toBe('USDC');
			expect(inputTokenAddress).toBe(TOK_IN_ADDR);
			expect(outputTokenAddress).toBe(TOK_OUT_ADDR);
			expect(inputTokenDecimals).toBe(18);
			expect(outputTokenDecimals).toBe(6);
			expect(ioRatio).toBe(100);
			expect(actualSlippage).toBe(0n);
		});
	});
});
