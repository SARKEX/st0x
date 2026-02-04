import type { SgTrade } from '@rainlanguage/orderbook';
import { toDecimal } from '$lib/utils/tokenMath';
import { getMigrationMappingByNewAddress } from '$lib/config/tokenMigration';

export interface CostBasisData {
	tokenAddress: string;
	avgCostBasis: number; // Average cost per unit
	totalCost: number; // Total USD spent acquiring
	totalAcquired: number; // Total units bought
	totalSold: number; // Total units sold
	netPosition: number; // acquired - sold
	realizedPnL: number; // P&L from closed positions
}

export interface PortfolioPnL {
	costBasis: number; // Average cost per unit
	totalCost: number; // Total USD invested in current position
	currentValue: number; // Current market value
	unrealizedPnL: number; // Current value - total cost
	unrealizedPnLPercent: number;
}

/**
 * Calculate cost basis for a single token based on trade history.
 * Uses average cost method for acquisitions.
 *
 * Handles both taker and maker trades:
 * - Taker (sender): inputVaultBalanceChange = PAYS, outputVaultBalanceChange = RECEIVES
 * - Maker (vault owner): inputVaultBalanceChange = RECEIVES, outputVaultBalanceChange = PAYS
 *
 * @param trades - All trades involving the user (as taker or maker)
 * @param assetTokenAddress - The asset token to calculate cost basis for
 * @param paymentTokenAddresses - Set of payment token addresses (e.g., USDC)
 * @param userAddress - The user's wallet address (to determine taker vs maker)
 */
export function calculateCostBasisForToken(
	trades: SgTrade[],
	assetTokenAddress: string,
	paymentTokenAddresses: Set<string>,
	userAddress: string
): CostBasisData | null {
	const normalizedAsset = assetTokenAddress.toLowerCase();
	const normalizedUser = userAddress.toLowerCase();

	let totalCost = 0;
	let totalAcquired = 0;
	let totalSold = 0;
	let realizedPnL = 0;
	let avgCostBasis = 0;

	// Track current position to detect when it goes to zero
	let currentPosition = 0;

	// Filter trades involving this asset token
	const relevantTrades = trades.filter((trade) => {
		const inputToken = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		const outputToken = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		return inputToken === normalizedAsset || outputToken === normalizedAsset;
	});

	if (relevantTrades.length === 0) {
		return null;
	}

	// Sort by timestamp ascending (oldest first) for proper cost tracking
	relevantTrades.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

	for (const trade of relevantTrades) {
		const inputToken = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		const outputToken = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		const inputDecimals = Number(trade.inputVaultBalanceChange?.vault?.token?.decimals ?? 18);
		const outputDecimals = Number(trade.outputVaultBalanceChange?.vault?.token?.decimals ?? 18);

		// Get vault owners to determine if user is maker
		const inputVaultOwner = (
			trade.inputVaultBalanceChange?.vault as { owner?: string }
		)?.owner?.toLowerCase();
		const outputVaultOwner = (
			trade.outputVaultBalanceChange?.vault as { owner?: string }
		)?.owner?.toLowerCase();
		const tradeSender = trade.tradeEvent?.sender?.toLowerCase();
		const txFrom = trade.tradeEvent?.transaction?.from?.toLowerCase();

		// Determine user's role in this trade
		// Taker: user is sender OR user initiated the tx (aggregator case)
		const isTaker = tradeSender === normalizedUser || txFrom === normalizedUser;
		const isMaker = inputVaultOwner === normalizedUser || outputVaultOwner === normalizedUser;

		// Skip if user is neither taker nor maker (shouldn't happen with proper filtering)
		if (!isTaker && !isMaker) {
			continue;
		}

		// Get amounts - these are Float hex strings from Rain orderbook
		const inputAmountRaw = trade.inputVaultBalanceChange?.amount;
		const outputAmountRaw = trade.outputVaultBalanceChange?.amount;

		// Parse amounts using toDecimal which handles Float hex format
		const inputAmount = toDecimal(inputAmountRaw, inputDecimals, { absolute: true }) ?? 0;
		const outputAmount = toDecimal(outputAmountRaw, outputDecimals, { absolute: true }) ?? 0;

		// Determine what the user received and paid based on their role
		// Taker: pays inputVaultBalanceChange, receives outputVaultBalanceChange
		// Maker: receives inputVaultBalanceChange, pays outputVaultBalanceChange
		let userReceivesToken: string | undefined;
		let userReceivesAmount: number;
		let userPaysToken: string | undefined;
		let userPaysAmount: number;

		if (isTaker) {
			// Taker perspective: pays input, receives output
			userReceivesToken = outputToken;
			userReceivesAmount = outputAmount;
			userPaysToken = inputToken;
			userPaysAmount = inputAmount;
		} else {
			// Maker perspective: receives input, pays output
			userReceivesToken = inputToken;
			userReceivesAmount = inputAmount;
			userPaysToken = outputToken;
			userPaysAmount = outputAmount;
		}

		// Determine if this is a BUY or SELL of the asset from user's perspective
		const isAssetBuy =
			userReceivesToken === normalizedAsset && paymentTokenAddresses.has(userPaysToken ?? '');
		const isAssetSell =
			userPaysToken === normalizedAsset && paymentTokenAddresses.has(userReceivesToken ?? '');

		if (isAssetBuy) {
			// If position was zero, we're starting a fresh cost basis pool
			if (currentPosition === 0) {
				totalCost = 0;
				totalAcquired = 0;
			}

			totalAcquired += userReceivesAmount;
			totalCost += userPaysAmount;
			currentPosition += userReceivesAmount;

			if (totalAcquired > 0) {
				avgCostBasis = totalCost / totalAcquired;
			}
		} else if (isAssetSell) {
			const sellAmount = userPaysAmount;
			totalSold += sellAmount;

			if (avgCostBasis > 0) {
				const costOfSoldUnits = sellAmount * avgCostBasis;
				realizedPnL += userReceivesAmount - costOfSoldUnits;
			}

			currentPosition -= sellAmount;
			// When position goes to zero, the cost pool will reset on next buy
		}
	}

	// Use currentPosition for accuracy
	const netPosition = currentPosition;

	return {
		tokenAddress: normalizedAsset,
		avgCostBasis,
		totalCost,
		totalAcquired,
		totalSold,
		netPosition,
		realizedPnL
	};
}

/**
 * Calculate cost basis for all tokens the user has traded.
 * @param trades - All trades involving the user (as taker or maker)
 * @param paymentTokenAddresses - Set of payment token addresses (e.g., USDC)
 * @param userAddress - The user's wallet address
 */
export function calculateAllCostBases(
	trades: SgTrade[],
	paymentTokenAddresses: Set<string>,
	userAddress: string
): Map<string, CostBasisData> {
	const costBasisMap = new Map<string, CostBasisData>();

	// Get unique asset token addresses from trades
	const assetTokenAddresses = new Set<string>();

	for (const trade of trades) {
		const inputToken = trade.inputVaultBalanceChange?.vault?.token?.address?.toLowerCase();
		const outputToken = trade.outputVaultBalanceChange?.vault?.token?.address?.toLowerCase();

		if (inputToken && !paymentTokenAddresses.has(inputToken)) {
			assetTokenAddresses.add(inputToken);
		}
		if (outputToken && !paymentTokenAddresses.has(outputToken)) {
			assetTokenAddresses.add(outputToken);
		}
	}

	for (const tokenAddress of assetTokenAddresses) {
		const costBasis = calculateCostBasisForToken(
			trades,
			tokenAddress,
			paymentTokenAddresses,
			userAddress
		);
		if (costBasis) {
			costBasisMap.set(tokenAddress, costBasis);
		}
	}

	// Merge old token cost basis into new wrapped token for token migrations
	for (const [tokenAddress, costBasis] of costBasisMap) {
		// Check if this is a new wrapped token with a corresponding old token
		const migrationMapping = getMigrationMappingByNewAddress(tokenAddress);
		if (!migrationMapping) continue;

		const oldTokenAddress = migrationMapping.oldToken.address.toLowerCase();
		const oldCostBasis = costBasisMap.get(oldTokenAddress);

		if (oldCostBasis && oldCostBasis.totalAcquired > 0) {
			// Merge old token's acquisition history into new token
			const combinedTotalAcquired = costBasis.totalAcquired + oldCostBasis.totalAcquired;
			const combinedTotalCost = costBasis.totalCost + oldCostBasis.totalCost;
			const combinedTotalSold = costBasis.totalSold + oldCostBasis.totalSold;
			const combinedRealizedPnL = costBasis.realizedPnL + oldCostBasis.realizedPnL;

			costBasisMap.set(tokenAddress, {
				tokenAddress,
				avgCostBasis: combinedTotalAcquired > 0 ? combinedTotalCost / combinedTotalAcquired : 0,
				totalCost: combinedTotalCost,
				totalAcquired: combinedTotalAcquired,
				totalSold: combinedTotalSold,
				netPosition: combinedTotalAcquired - combinedTotalSold,
				realizedPnL: combinedRealizedPnL
			});

			// Remove old token's cost basis entry (it's now merged)
			costBasisMap.delete(oldTokenAddress);
		}
	}

	return costBasisMap;
}

/**
 * Calculate unrealized P&L for a holding based on cost basis and current price.
 */
export function calculatePnL(
	costBasis: CostBasisData | undefined,
	currentBalance: number,
	currentPrice: number
): PortfolioPnL | null {
	if (!costBasis || currentBalance <= 0 || costBasis.avgCostBasis <= 0) {
		return null;
	}

	// Use the smaller of current balance or net acquired position for cost calculation
	// This handles cases where user received tokens from other sources
	const positionForCostCalc = Math.min(currentBalance, costBasis.netPosition);

	if (positionForCostCalc <= 0) {
		return null;
	}

	const totalCost = positionForCostCalc * costBasis.avgCostBasis;
	const currentValue = positionForCostCalc * currentPrice;
	const unrealizedPnL = currentValue - totalCost;
	const unrealizedPnLPercent = totalCost > 0 ? (unrealizedPnL / totalCost) * 100 : 0;

	return {
		costBasis: costBasis.avgCostBasis,
		totalCost,
		currentValue,
		unrealizedPnL,
		unrealizedPnLPercent
	};
}
