import { toDecimal } from '$lib/utils/tokenMath';
import { getMigrationMappingByAddress } from '$lib/config/tokenMigration';

/**
 * Minimal trade shape consumed by cost basis calculation.
 * Compatible with SgTrade from @rainlanguage/orderbook but does not depend on it.
 * API-sourced trades can satisfy this interface directly.
 */
export interface CostBasisTrade {
	timestamp: number | string;
	inputVaultBalanceChange?: {
		amount?: string;
		vault?: {
			token?: { address?: string; decimals?: number | string };
			owner?: string;
		};
	};
	outputVaultBalanceChange?: {
		amount?: string;
		vault?: {
			token?: { address?: string; decimals?: number | string };
			owner?: string;
		};
	};
	tradeEvent?: {
		sender?: string;
		transaction?: { from?: string };
	};
}

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
	trades: CostBasisTrade[],
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
		const inputVaultOwner = trade.inputVaultBalanceChange?.vault?.owner?.toLowerCase();
		const outputVaultOwner = trade.outputVaultBalanceChange?.vault?.owner?.toLowerCase();
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

		// Get amounts (hex Float from subgraph, or decimal strings from REST API)
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

			if (avgCostBasis > 0 && currentPosition > 0) {
				// Only compute P&L on units that have a tracked cost basis
				const trackedSellAmount = Math.min(sellAmount, currentPosition);
				const costOfSoldUnits = trackedSellAmount * avgCostBasis;
				// Prorate received amount if sell exceeds tracked position
				const trackedReceived =
					sellAmount > 0 ? userReceivesAmount * (trackedSellAmount / sellAmount) : 0;
				realizedPnL += trackedReceived - costOfSoldUnits;
			}

			currentPosition = Math.max(0, currentPosition - sellAmount);
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
	trades: CostBasisTrade[],
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
	// Iterate from old token perspective so merging works even when the new
	// wrapped token has no trades yet (i.e. is not already in the map).
	for (const [tokenAddress, costBasis] of Array.from(costBasisMap.entries())) {
		// Check if this is an old (legacy) token with a migration to a new wrapped token
		const migrationMapping = getMigrationMappingByAddress(tokenAddress);
		if (!migrationMapping) continue;
		if (costBasis.totalAcquired <= 0) continue;

		const newTokenAddress = migrationMapping.newToken.address.toLowerCase();
		const existingNew = costBasisMap.get(newTokenAddress);

		if (existingNew) {
			// Merge old token's acquisition history into existing new token entry
			const combinedTotalAcquired = existingNew.totalAcquired + costBasis.totalAcquired;
			const combinedTotalCost = existingNew.totalCost + costBasis.totalCost;
			const combinedTotalSold = existingNew.totalSold + costBasis.totalSold;
			const combinedRealizedPnL = existingNew.realizedPnL + costBasis.realizedPnL;

			costBasisMap.set(newTokenAddress, {
				tokenAddress: newTokenAddress,
				avgCostBasis: combinedTotalAcquired > 0 ? combinedTotalCost / combinedTotalAcquired : 0,
				totalCost: combinedTotalCost,
				totalAcquired: combinedTotalAcquired,
				totalSold: combinedTotalSold,
				netPosition: existingNew.netPosition + costBasis.netPosition,
				realizedPnL: combinedRealizedPnL
			});
		} else {
			// New wrapped token has no trades yet — carry over old token's cost basis directly
			costBasisMap.set(newTokenAddress, { ...costBasis, tokenAddress: newTokenAddress });
		}

		// Remove old token's cost basis entry (it's now merged)
		costBasisMap.delete(tokenAddress);
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
