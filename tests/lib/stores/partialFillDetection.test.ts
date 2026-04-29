import { describe, it, expect } from 'vitest';
import { detectPartialFill } from '$lib/stores/partialFillDetection';

const COMMON = {
	inputTokenSymbol: 'tNVDA',
	inputTokenAddress: '0x000000000000000000000000000000000000aaaa',
	inputTokenDecimals: 18,
	outputTokenSymbol: 'USDC',
	outputTokenAddress: '0x000000000000000000000000000000000000bbbb',
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
			const summary = detectPartialFill({
				...COMMON,
				totalTakerWantsAmount: 998n,
				totalTakerPaysAmount: 99_800n,
				requestedTakerWantsAmount: 1_000n
			});
			expect(summary.inputAmount).toBe(998n);
			expect(summary.outputAmount).toBe(99_800n);
			expect(summary.requestedInputAmount).toBe(1_000n);
			expect(summary.inputTokenSymbol).toBe('tNVDA');
			expect(summary.outputTokenSymbol).toBe('USDC');
			expect(summary.inputTokenAddress).toBe(COMMON.inputTokenAddress);
			expect(summary.outputTokenAddress).toBe(COMMON.outputTokenAddress);
			expect(summary.inputTokenDecimals).toBe(18);
			expect(summary.outputTokenDecimals).toBe(6);
			expect(summary.ioRatio).toBe(100);
			expect(summary.actualSlippage).toBe(0n);
		});
	});
});
