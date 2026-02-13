/**
 * Rhinestone Cross-Chain Swaps
 *
 * Handles cross-chain token swaps using Rhinestone's solver network.
 * Supports swapping any supported token to USDC on Base for tStock trading.
 *
 * Key flow:
 * 1. User selects source token/chain (e.g., USDT on Arbitrum)
 * 2. Get swap quote to USDC on Base (settlement)
 * 3. Execute via Rhinestone's intent-based system
 * 4. Solvers compete to fill the order, ensuring best execution
 */

import type { Address, Hex, Account } from 'viem';
import { encodeFunctionData, parseAbi } from 'viem';
import { getRhinestoneClient } from './client';
import {
	type PaymentToken,
	type CrossChainSwapParams,
	type CrossChainSwapQuote,
	type SwapRoute,
	type SupportedNetworkId,
	SUPPORTED_NETWORKS,
	SETTLEMENT_CHAIN_ID,
	AAError,
	AAErrorCode
} from '../types';
import { USDC_BASE } from '../tokens';

/** Returns a passthrough quote when no swap is needed (already correct token/chain). */
export function noSwapQuote(amount: bigint): CrossChainSwapQuote {
	return {
		inputAmount: amount,
		outputAmount: amount,
		estimatedGas: {
			gasLimit: 0n,
			maxFeePerGas: 0n,
			maxPriorityFeePerGas: 0n,
			estimatedGasCostWei: 0n,
			estimatedGasCostUSDC: 0n
		},
		route: { steps: [], totalSteps: 0, estimatedDuration: 0 },
		expiresAt: Date.now() + 300_000,
		priceImpactBps: 0
	};
}

// ERC20 ABI for approvals and transfers
const ERC20_ABI = parseAbi([
	'function approve(address spender, uint256 amount) returns (bool)',
	'function transfer(address to, uint256 amount) returns (bool)',
	'function balanceOf(address account) view returns (uint256)',
	'function allowance(address owner, address spender) view returns (uint256)'
]);

/**
 * Get a quote for swapping tokens to USDC on Base
 *
 * @param sourceToken - The token to swap from
 * @param amount - Amount to swap (in source token decimals)
 * @param recipient - The address to receive USDC
 */
export async function getSwapToSettlementQuote(
	sourceToken: PaymentToken,
	amount: bigint,
	recipient: Address,
	feeAsset?: string
): Promise<CrossChainSwapQuote> {
	const client = getRhinestoneClient();

	// If source token is already USDC on Base, no swap needed
	if (sourceToken.chainId === SETTLEMENT_CHAIN_ID && sourceToken.symbol === 'USDC') {
		return noSwapQuote(amount);
	}

	const swapParams: CrossChainSwapParams = {
		sourceChain: sourceToken.chainId,
		targetChain: SETTLEMENT_CHAIN_ID,
		sourceToken,
		targetToken: USDC_BASE,
		amount,
		recipient,
		slippageBps: 50 // 0.5% default slippage
	};

	return client.getSwapQuote(swapParams, feeAsset);
}

/**
 * Get a quote for swapping USDC on Base to another token
 * (Used when user sells tStock and wants proceeds in different token/chain)
 *
 * @param targetToken - The token to receive
 * @param usdcAmount - Amount of USDC to swap (in USDC decimals)
 * @param recipient - The address to receive target token
 */
export async function getSwapFromSettlementQuote(
	targetToken: PaymentToken,
	usdcAmount: bigint,
	recipient: Address
): Promise<CrossChainSwapQuote> {
	const client = getRhinestoneClient();

	// If target token is already USDC on Base, no swap needed
	if (targetToken.chainId === SETTLEMENT_CHAIN_ID && targetToken.symbol === 'USDC') {
		return noSwapQuote(usdcAmount);
	}

	const swapParams: CrossChainSwapParams = {
		sourceChain: SETTLEMENT_CHAIN_ID,
		targetChain: targetToken.chainId,
		sourceToken: USDC_BASE,
		targetToken,
		amount: usdcAmount,
		recipient,
		slippageBps: 50 // 0.5% default slippage
	};

	return client.getSwapQuote(swapParams);
}

/**
 * Calculate the optimal swap route for a trade
 */
export function calculateOptimalRoute(
	sourceToken: PaymentToken,
	targetToken: PaymentToken,
	amount: bigint
): SwapRoute {
	const steps = [];

	// Case 1: Same chain swap
	if (sourceToken.chainId === targetToken.chainId) {
		steps.push({
			type: 'swap' as const,
			chainId: sourceToken.chainId,
			protocol: 'rhinestone-solver',
			tokenIn: sourceToken.address,
			tokenOut: targetToken.address,
			amountIn: amount,
			amountOut: amount // Will be calculated by solver
		});

		return {
			steps,
			totalSteps: 1,
			estimatedDuration: 15 // 15 seconds for same-chain
		};
	}

	// Case 2: Cross-chain swap
	// Step 1: Swap to bridgeable token if needed (USDC is best for bridges)
	if (sourceToken.symbol !== 'USDC') {
		steps.push({
			type: 'swap' as const,
			chainId: sourceToken.chainId,
			protocol: 'rhinestone-solver',
			tokenIn: sourceToken.address,
			tokenOut: getUSDCAddress(sourceToken.chainId),
			amountIn: amount,
			amountOut: amount // Will be calculated
		});
	}

	// Step 2: Bridge USDC to target chain
	steps.push({
		type: 'bridge' as const,
		chainId: sourceToken.chainId,
		protocol: 'rhinestone-intent',
		tokenIn: getUSDCAddress(sourceToken.chainId),
		tokenOut: getUSDCAddress(targetToken.chainId),
		amountIn: amount,
		amountOut: amount // 1:1 for USDC bridges typically
	});

	// Step 3: Swap to target token if not USDC
	if (targetToken.symbol !== 'USDC') {
		steps.push({
			type: 'swap' as const,
			chainId: targetToken.chainId,
			protocol: 'rhinestone-solver',
			tokenIn: getUSDCAddress(targetToken.chainId),
			tokenOut: targetToken.address,
			amountIn: amount,
			amountOut: amount // Will be calculated
		});
	}

	return {
		steps,
		totalSteps: steps.length,
		estimatedDuration: 60 + (steps.length - 1) * 15 // Base 60s for bridge + 15s per swap
	};
}

/**
 * Get USDC address for a specific chain
 */
function getUSDCAddress(chainId: SupportedNetworkId): Address {
	const addresses: Record<SupportedNetworkId, Address> = {
		[SUPPORTED_NETWORKS.BASE]: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
		[SUPPORTED_NETWORKS.ARBITRUM]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
		[SUPPORTED_NETWORKS.OPTIMISM]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
		[SUPPORTED_NETWORKS.ETHEREUM]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
		[SUPPORTED_NETWORKS.BASE_SEPOLIA]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
		[SUPPORTED_NETWORKS.ARBITRUM_SEPOLIA]: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d'
	};
	return addresses[chainId];
}

/**
 * Encode approval transaction for ERC20 token
 */
export function encodeApproval(spender: Address, amount: bigint): Hex {
	return encodeFunctionData({
		abi: ERC20_ABI,
		functionName: 'approve',
		args: [spender, amount]
	});
}

/**
 * Check if a swap is needed for the given token/chain combination
 */
export function isSwapRequired(
	sourceToken: PaymentToken,
	targetChainId: SupportedNetworkId,
	targetSymbol: string
): boolean {
	return sourceToken.chainId !== targetChainId || sourceToken.symbol !== targetSymbol;
}

/**
 * Estimate the total cost of a cross-chain swap including gas
 */
export async function estimateSwapCost(
	sourceToken: PaymentToken,
	amount: bigint,
	recipient: Address
): Promise<{
	swapFeeUSDC: bigint;
	gasCostUSDC: bigint;
	totalCostUSDC: bigint;
	estimatedOutputUSDC: bigint;
}> {
	const quote = await getSwapToSettlementQuote(sourceToken, amount, recipient);

	// Rhinestone typically has zero slippage due to solver competition
	// But we account for potential price impact
	const priceImpactCost = (quote.outputAmount * BigInt(quote.priceImpactBps)) / 10000n;
	const swapFeeUSDC = priceImpactCost;
	const gasCostUSDC = quote.estimatedGas.estimatedGasCostUSDC;
	const totalCostUSDC = swapFeeUSDC + gasCostUSDC;
	const estimatedOutputUSDC = quote.outputAmount - totalCostUSDC;

	return {
		swapFeeUSDC,
		gasCostUSDC,
		totalCostUSDC,
		estimatedOutputUSDC
	};
}

/**
 * Validate that a swap can be executed
 */
export async function validateSwap(
	sourceToken: PaymentToken,
	amount: bigint,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	_userAddress: Address
): Promise<{ valid: boolean; error?: string }> {
	const client = getRhinestoneClient();

	// Check network support
	if (!client.isSupportedNetwork(sourceToken.chainId)) {
		return {
			valid: false,
			error: `Network ${sourceToken.chainId} is not supported for cross-chain swaps`
		};
	}

	// Check minimum amount (prevent dust transactions)
	const MIN_SWAP_AMOUNT_USD = 1n * 10n ** 6n; // $1 minimum
	// This is a simplified check - in production, convert to USD using price feed
	if (sourceToken.symbol === 'USDC' && amount < MIN_SWAP_AMOUNT_USD) {
		return {
			valid: false,
			error: 'Minimum swap amount is $1'
		};
	}

	return { valid: true };
}

/**
 * Execute a swap from source token to USDC on Base (settlement)
 *
 * This is the main function used during tStock purchases when user
 * pays with a non-USDC token or from a different chain.
 *
 * @param sourceToken - The token to swap from
 * @param amount - Amount to swap (in source token decimals)
 * @param recipient - The address to receive USDC
 * @param walletAccount - User's wallet account for signing
 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
 */
export async function executeSwapToSettlement(
	sourceToken: PaymentToken,
	amount: bigint,
	recipient: Address,
	walletAccount: Account,
	feeAsset?: string
): Promise<{ txHash: Hex; intentId: string; outputAmount: bigint }> {
	const client = getRhinestoneClient();

	// Validate the swap first
	const validation = await validateSwap(sourceToken, amount, recipient);
	if (!validation.valid) {
		throw new AAError(validation.error || 'Swap validation failed', AAErrorCode.SWAP_FAILED);
	}

	// If already USDC on Base, no swap needed
	if (sourceToken.chainId === SETTLEMENT_CHAIN_ID && sourceToken.symbol === 'USDC') {
		// Return mock result - no actual swap executed
		return {
			txHash: '0x' as Hex,
			intentId: '',
			outputAmount: amount
		};
	}

	// Get quote first to know expected output
	const quote = await getSwapToSettlementQuote(sourceToken, amount, recipient);

	// Check if this is a same-chain swap (e.g., WETH → USDC on Base)
	const isSameChain = sourceToken.chainId === SETTLEMENT_CHAIN_ID;

	if (isSameChain) {
		// For same-chain swaps, use executeSameChainSwap which handles tokenRequests properly
		const result = await client.executeSameChainSwap(
			{
				chainId: sourceToken.chainId,
				sourceToken,
				targetToken: USDC_BASE,
				amount,
				recipient,
				slippageBps: 50
			},
			walletAccount,
			feeAsset
		);

		return {
			txHash: result.txHash,
			intentId: result.intentId,
			outputAmount: quote.outputAmount
		};
	}

	// Execute cross-chain swap for different chains
	const swapParams: CrossChainSwapParams = {
		sourceChain: sourceToken.chainId,
		targetChain: SETTLEMENT_CHAIN_ID,
		sourceToken,
		targetToken: USDC_BASE,
		amount,
		recipient,
		slippageBps: 50
	};

	const result = await client.executeCrossChainSwap(swapParams, walletAccount, feeAsset);

	return {
		txHash: result.txHash,
		intentId: result.intentId,
		outputAmount: quote.outputAmount
	};
}

/**
 * Execute a swap from USDC on Base to target token
 *
 * This is used after selling tStocks when user wants proceeds
 * in a different token or on a different chain.
 *
 * @param targetToken - The token to receive
 * @param usdcAmount - Amount of USDC to swap (in USDC decimals)
 * @param recipient - The address to receive target token
 * @param walletAccount - User's wallet account for signing
 * @param feeAsset - Optional asset for gas payment (e.g., 'USDC' for ERC20 gas)
 */
export async function executeSwapFromSettlement(
	targetToken: PaymentToken,
	usdcAmount: bigint,
	recipient: Address,
	walletAccount: Account,
	feeAsset?: string
): Promise<{ txHash: Hex; intentId: string; outputAmount: bigint }> {
	const client = getRhinestoneClient();

	// If target is already USDC on Base, no swap needed
	if (targetToken.chainId === SETTLEMENT_CHAIN_ID && targetToken.symbol === 'USDC') {
		return {
			txHash: '0x' as Hex,
			intentId: '',
			outputAmount: usdcAmount
		};
	}

	// Get quote first
	const quote = await getSwapFromSettlementQuote(targetToken, usdcAmount, recipient);

	// Execute the cross-chain swap
	const swapParams: CrossChainSwapParams = {
		sourceChain: SETTLEMENT_CHAIN_ID,
		targetChain: targetToken.chainId,
		sourceToken: USDC_BASE,
		targetToken,
		amount: usdcAmount,
		recipient,
		slippageBps: 50
	};

	const result = await client.executeCrossChainSwap(swapParams, walletAccount, feeAsset);

	return {
		txHash: result.txHash,
		intentId: result.intentId,
		outputAmount: quote.outputAmount
	};
}

/**
 * Get the USDC equivalent amount for a token on any chain
 * Used to display estimated costs in USDC terms
 */
export async function getUSDCEquivalent(
	token: PaymentToken,
	amount: bigint,
	recipient: Address
): Promise<bigint> {
	// If already USDC, return as-is
	if (token.symbol === 'USDC') {
		return amount;
	}

	// For stablecoins (USDT), assume 1:1 with minor slippage
	if (token.symbol === 'USDT') {
		// 0.1% slippage for stablecoin swaps
		return amount - amount / 1000n;
	}

	// For ETH/WETH, use price oracle
	if (token.symbol === 'ETH' || token.symbol === 'WETH') {
		const { getPriceOracle } = await import('../index');
		const priceOracle = getPriceOracle();
		const prices = await priceOracle.getTokenPrices(['ETH']);
		const ethPriceUsd = prices.get('ETH')?.priceUsd ?? 3000;
		// Convert: amount (18 decimals) * ethPrice -> USDC (6 decimals)
		const ethPriceUSDC = BigInt(Math.round(ethPriceUsd * 1e6));
		return (amount * ethPriceUSDC) / 10n ** 18n;
	}

	// Default: get quote
	const quote = await getSwapToSettlementQuote(token, amount, recipient);
	return quote.outputAmount;
}
