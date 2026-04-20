import { describe, it, expect } from 'vitest';
import { calculateCostBasisForToken, type CostBasisTrade } from '$lib/utils/costBasis';

// Helper to create a mock trade
function makeTrade({
	timestamp,
	isBuy,
	assetAmount,
	paymentAmount,
	userAddress,
	assetAddress = '0xasset',
	paymentAddress = '0xusdc'
}: {
	timestamp: number;
	isBuy: boolean;
	assetAmount: number;
	paymentAmount: number;
	userAddress: string;
	assetAddress?: string;
	paymentAddress?: string;
}): CostBasisTrade {
	// For taker perspective:
	// isBuy=true: user pays USDC (input), receives asset (output)
	// isBuy=false: user pays asset (input), receives USDC (output)
	const inputToken = isBuy ? paymentAddress : assetAddress;
	const outputToken = isBuy ? assetAddress : paymentAddress;
	const inputAmount = isBuy ? paymentAmount : assetAmount;
	const outputAmount = isBuy ? assetAmount : paymentAmount;

	return {
		timestamp: timestamp.toString(),
		inputVaultBalanceChange: {
			amount: (inputAmount * 1e18).toString(),
			vault: {
				token: {
					address: inputToken,
					decimals: '18'
				}
			}
		},
		outputVaultBalanceChange: {
			amount: (outputAmount * 1e18).toString(),
			vault: {
				token: {
					address: outputToken,
					decimals: '18'
				}
			}
		},
		tradeEvent: {
			sender: userAddress
		}
	};
}

describe('costBasis', () => {
	describe('calculateCostBasisForToken', () => {
		const assetAddr = '0xasset';
		const paymentAddrs = new Set(['0xusdc']);
		const user = '0xuser';

		it('calculates basic cost basis for single buy', () => {
			const trades = [makeTrade({ timestamp: 1, isBuy: true, assetAmount: 1, paymentAmount: 100, userAddress: user })];

			const result = calculateCostBasisForToken(trades, assetAddr, paymentAddrs, user);

			expect(result).not.toBeNull();
			expect(result!.avgCostBasis).toBe(100);
			expect(result!.totalAcquired).toBe(1);
			expect(result!.netPosition).toBe(1);
			expect(result!.realizedPnL).toBe(0);
		});

		it('calculates averaged cost basis for multiple buys', () => {
			const trades = [
				makeTrade({ timestamp: 1, isBuy: true, assetAmount: 1, paymentAmount: 100, userAddress: user }),
				makeTrade({ timestamp: 2, isBuy: true, assetAmount: 1, paymentAmount: 200, userAddress: user })
			];

			const result = calculateCostBasisForToken(trades, assetAddr, paymentAddrs, user);

			expect(result).not.toBeNull();
			expect(result!.avgCostBasis).toBe(150); // (100 + 200) / 2
			expect(result!.totalAcquired).toBe(2);
			expect(result!.netPosition).toBe(2);
		});

		it('calculates realized P&L on sell', () => {
			const trades = [
				makeTrade({ timestamp: 1, isBuy: true, assetAmount: 1, paymentAmount: 100, userAddress: user }),
				makeTrade({ timestamp: 2, isBuy: false, assetAmount: 1, paymentAmount: 120, userAddress: user })
			];

			const result = calculateCostBasisForToken(trades, assetAddr, paymentAddrs, user);

			expect(result).not.toBeNull();
			expect(result!.avgCostBasis).toBe(100);
			expect(result!.realizedPnL).toBe(20); // 120 - 100
			expect(result!.netPosition).toBe(0);
		});

		it('resets cost basis when position goes to zero', () => {
			const trades = [
				makeTrade({ timestamp: 1, isBuy: true, assetAmount: 1, paymentAmount: 100, userAddress: user }),
				makeTrade({ timestamp: 2, isBuy: false, assetAmount: 1, paymentAmount: 120, userAddress: user }),
				makeTrade({ timestamp: 3, isBuy: true, assetAmount: 1, paymentAmount: 120, userAddress: user }),
				makeTrade({ timestamp: 4, isBuy: false, assetAmount: 1, paymentAmount: 140, userAddress: user })
			];

			const result = calculateCostBasisForToken(trades, assetAddr, paymentAddrs, user);

			expect(result).not.toBeNull();
			// After position reset, avgCostBasis should be $120 (the new buy price), not $110
			expect(result!.avgCostBasis).toBe(120);
			// Total realized P&L: $20 (first trade) + $20 (second trade) = $40, not $50
			expect(result!.realizedPnL).toBe(40);
			expect(result!.netPosition).toBe(0);
		});

		it('does not reset cost basis for partial sells', () => {
			const trades = [
				makeTrade({ timestamp: 1, isBuy: true, assetAmount: 2, paymentAmount: 200, userAddress: user }),
				makeTrade({ timestamp: 2, isBuy: false, assetAmount: 1, paymentAmount: 120, userAddress: user }),
				makeTrade({ timestamp: 3, isBuy: true, assetAmount: 1, paymentAmount: 150, userAddress: user })
			];

			const result = calculateCostBasisForToken(trades, assetAddr, paymentAddrs, user);

			expect(result).not.toBeNull();
			// Position never went to zero, so cost basis uses cumulative average:
			// After first buy: avgCost = 200/2 = 100, totalAcquired = 2
			// After sell: avgCost stays 100, position = 1
			// After second buy: totalCost = 350, totalAcquired = 3, avgCost = 350/3 ≈ 116.67
			expect(result!.avgCostBasis).toBeCloseTo(116.67, 2);
			expect(result!.netPosition).toBe(2);
			expect(result!.realizedPnL).toBe(20); // 120 - 100
		});

		it('handles multiple position cycles correctly', () => {
			const trades = [
				// First cycle: buy at 100, sell at 110
				makeTrade({ timestamp: 1, isBuy: true, assetAmount: 1, paymentAmount: 100, userAddress: user }),
				makeTrade({ timestamp: 2, isBuy: false, assetAmount: 1, paymentAmount: 110, userAddress: user }),
				// Second cycle: buy at 200, sell at 250
				makeTrade({ timestamp: 3, isBuy: true, assetAmount: 1, paymentAmount: 200, userAddress: user }),
				makeTrade({ timestamp: 4, isBuy: false, assetAmount: 1, paymentAmount: 250, userAddress: user }),
				// Third cycle: buy at 300, hold
				makeTrade({ timestamp: 5, isBuy: true, assetAmount: 1, paymentAmount: 300, userAddress: user })
			];

			const result = calculateCostBasisForToken(trades, assetAddr, paymentAddrs, user);

			expect(result).not.toBeNull();
			// Current avgCostBasis should be from the third cycle only
			expect(result!.avgCostBasis).toBe(300);
			expect(result!.netPosition).toBe(1);
			// Total realized: $10 (cycle 1) + $50 (cycle 2) = $60
			expect(result!.realizedPnL).toBe(60);
		});

		it('returns null for trades not involving the asset', () => {
			const trades = [makeTrade({ timestamp: 1, isBuy: true, assetAmount: 1, paymentAmount: 100, userAddress: user, assetAddress: '0xother' })];

			const result = calculateCostBasisForToken(trades, assetAddr, paymentAddrs, user);

			expect(result).toBeNull();
		});

		it('returns null for empty trades array', () => {
			const result = calculateCostBasisForToken([], assetAddr, paymentAddrs, user);

			expect(result).toBeNull();
		});
	});
});
