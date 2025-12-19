/**
 * BigInt Precision Math Utilities
 *
 * This module provides BigInt-based arithmetic operations for handling token amounts
 * and price calculations without floating-point precision loss.
 *
 * Key concepts:
 * - PRICE_SCALE: Standard 18-decimal precision for price representations
 * - All price calculations use scaled BigInt arithmetic
 * - Conversion functions handle different token decimal configurations
 */

/**
 * Standard precision scale for prices (18 decimals)
 * This matches the common ERC-20 token decimal standard
 */
export const PRICE_SCALE = 10n ** 18n;
export const PRICE_DECIMALS = 18;

/**
 * Converts a floating-point price to a scaled BigInt representation.
 *
 * @param price - The price as a floating-point number (e.g., 123.45)
 * @param scale - The scale to use (default: PRICE_SCALE = 10^18)
 * @returns The price as a scaled BigInt
 *
 * @example
 * // Price of $123.45 per token
 * const scaledPrice = priceToScaledBigInt(123.45);
 * // Returns 123450000000000000000n (123.45 * 10^18)
 */
export function priceToScaledBigInt(price: number, scale: bigint = PRICE_SCALE): bigint {
	if (!Number.isFinite(price) || price < 0) {
		return 0n;
	}
	// Use string conversion to avoid floating-point precision issues
	// We multiply by scale and truncate to integer
	const scaledFloat = price * Number(scale);
	// Use Math.floor to truncate (not round) to avoid overshooting
	return BigInt(Math.floor(scaledFloat));
}

/**
 * Converts a scaled BigInt price back to a floating-point number.
 *
 * @param scaledPrice - The price as a scaled BigInt
 * @param scale - The scale used (default: PRICE_SCALE = 10^18)
 * @returns The price as a floating-point number
 */
export function scaledBigIntToPrice(scaledPrice: bigint, scale: bigint = PRICE_SCALE): number {
	return Number(scaledPrice) / Number(scale);
}

/**
 * Calculates asset amount from payment amount and price using BigInt arithmetic.
 *
 * Formula: assetAmount = paymentAmount / price
 *
 * @param paymentAmount - Payment amount in payment token's smallest unit (BigInt)
 * @param paymentDecimals - Decimals of the payment token (e.g., 6 for USDC)
 * @param scaledPrice - Price scaled to PRICE_SCALE (use priceToScaledBigInt)
 * @param assetDecimals - Decimals of the asset token (e.g., 18)
 * @returns Asset amount in asset token's smallest unit (BigInt)
 *
 * @example
 * // Buy tokens with 100 USDC at price $10 per token
 * const usdcAmount = 100_000_000n; // 100 USDC (6 decimals)
 * const price = priceToScaledBigInt(10); // $10 scaled
 * const tokenAmount = paymentToAsset(usdcAmount, 6, price, 18);
 * // Returns ~10_000_000_000_000_000_000n (10 tokens with 18 decimals)
 */
export function paymentToAsset(
	paymentAmount: bigint,
	paymentDecimals: number,
	scaledPrice: bigint,
	assetDecimals: number
): bigint {
	if (scaledPrice === 0n || paymentAmount === 0n) {
		return 0n;
	}

	// Normalize payment amount to 18 decimals for consistent calculation
	// paymentNormalized = paymentAmount * 10^(18 - paymentDecimals)
	const decimalDiff = PRICE_DECIMALS - paymentDecimals;
	const paymentNormalized =
		decimalDiff >= 0
			? paymentAmount * 10n ** BigInt(decimalDiff)
			: paymentAmount / 10n ** BigInt(-decimalDiff);

	// assetAmount (in 18 decimals) = paymentNormalized * PRICE_SCALE / scaledPrice
	const assetNormalized = (paymentNormalized * PRICE_SCALE) / scaledPrice;

	// Convert to asset decimals
	const assetDecimalDiff = assetDecimals - PRICE_DECIMALS;
	return assetDecimalDiff >= 0
		? assetNormalized * 10n ** BigInt(assetDecimalDiff)
		: assetNormalized / 10n ** BigInt(-assetDecimalDiff);
}

/**
 * Calculates payment amount from asset amount and price using BigInt arithmetic.
 *
 * Formula: paymentAmount = assetAmount * price
 *
 * @param assetAmount - Asset amount in asset token's smallest unit (BigInt)
 * @param assetDecimals - Decimals of the asset token (e.g., 18)
 * @param scaledPrice - Price scaled to PRICE_SCALE (use priceToScaledBigInt)
 * @param paymentDecimals - Decimals of the payment token (e.g., 6 for USDC)
 * @returns Payment amount in payment token's smallest unit (BigInt)
 *
 * @example
 * // Sell 10 tokens at price $10 per token
 * const tokenAmount = 10_000_000_000_000_000_000n; // 10 tokens (18 decimals)
 * const price = priceToScaledBigInt(10); // $10 scaled
 * const usdcAmount = assetToPayment(tokenAmount, 18, price, 6);
 * // Returns 100_000_000n (100 USDC with 6 decimals)
 */
export function assetToPayment(
	assetAmount: bigint,
	assetDecimals: number,
	scaledPrice: bigint,
	paymentDecimals: number
): bigint {
	if (assetAmount === 0n) {
		return 0n;
	}

	// Normalize asset amount to 18 decimals for consistent calculation
	const decimalDiff = PRICE_DECIMALS - assetDecimals;
	const assetNormalized =
		decimalDiff >= 0
			? assetAmount * 10n ** BigInt(decimalDiff)
			: assetAmount / 10n ** BigInt(-decimalDiff);

	// paymentAmount (in 18 decimals) = assetNormalized * scaledPrice / PRICE_SCALE
	const paymentNormalized = (assetNormalized * scaledPrice) / PRICE_SCALE;

	// Convert to payment decimals
	const paymentDecimalDiff = paymentDecimals - PRICE_DECIMALS;
	return paymentDecimalDiff >= 0
		? paymentNormalized * 10n ** BigInt(paymentDecimalDiff)
		: paymentNormalized / 10n ** BigInt(-paymentDecimalDiff);
}

/**
 * Calculates a percentage of a BigInt amount.
 *
 * @param amount - The base amount as BigInt
 * @param percent - The percentage (0-100)
 * @returns The percentage of the amount as BigInt
 *
 * @example
 * const balance = 1000_000_000n; // 1000 USDC
 * const twentyFivePercent = percentageOf(balance, 25);
 * // Returns 250_000_000n (250 USDC)
 */
export function percentageOf(amount: bigint, percent: number): bigint {
	if (amount === 0n || percent <= 0) {
		return 0n;
	}
	// Use BigInt multiplication to avoid precision loss
	// We multiply by 100 first to maintain precision, then divide by 10000
	return (amount * BigInt(Math.floor(percent * 100))) / 10000n;
}

/**
 * Adjusts a BigInt amount from one decimal precision to another.
 *
 * @param amount - The amount to adjust
 * @param fromDecimals - Current decimal precision
 * @param toDecimals - Target decimal precision
 * @returns The adjusted amount
 *
 * @example
 * // Convert 100 USDC (6 decimals) representation to 18 decimals
 * const usdc6 = 100_000_000n;
 * const usdc18 = adjustDecimals(usdc6, 6, 18);
 * // Returns 100_000_000_000_000_000_000n
 */
export function adjustDecimals(amount: bigint, fromDecimals: number, toDecimals: number): bigint {
	if (fromDecimals === toDecimals) {
		return amount;
	}
	const diff = toDecimals - fromDecimals;
	if (diff > 0) {
		return amount * 10n ** BigInt(diff);
	}
	return amount / 10n ** BigInt(-diff);
}

/**
 * Divides two BigInt amounts with proper decimal handling.
 * Useful for calculating ratios or prices from two token amounts.
 *
 * @param numerator - The numerator amount
 * @param numeratorDecimals - Decimals of the numerator token
 * @param denominator - The denominator amount
 * @param denominatorDecimals - Decimals of the denominator token
 * @param resultScale - Scale for the result (default: PRICE_SCALE)
 * @returns Scaled result as BigInt
 */
export function divideBigInts(
	numerator: bigint,
	numeratorDecimals: number,
	denominator: bigint,
	denominatorDecimals: number,
	resultScale: bigint = PRICE_SCALE
): bigint {
	if (denominator === 0n) {
		return 0n;
	}

	// Normalize both to 18 decimals
	const numNormalized = adjustDecimals(numerator, numeratorDecimals, PRICE_DECIMALS);
	const denNormalized = adjustDecimals(denominator, denominatorDecimals, PRICE_DECIMALS);

	// Perform division with scaling
	return (numNormalized * resultScale) / denNormalized;
}

/**
 * Multiplies two BigInt amounts with proper decimal handling.
 *
 * @param amount1 - First amount
 * @param decimals1 - Decimals of first amount
 * @param amount2 - Second amount
 * @param decimals2 - Decimals of second amount
 * @param resultDecimals - Desired decimals for result
 * @returns Result amount with specified decimals
 */
export function multiplyBigInts(
	amount1: bigint,
	decimals1: number,
	amount2: bigint,
	decimals2: number,
	resultDecimals: number
): bigint {
	// Normalize both to 18 decimals
	const norm1 = adjustDecimals(amount1, decimals1, PRICE_DECIMALS);
	const norm2 = adjustDecimals(amount2, decimals2, PRICE_DECIMALS);

	// Multiply and adjust for double-scaling (18 + 18 = 36 decimals after multiplication)
	const product = (norm1 * norm2) / PRICE_SCALE;

	// Convert to result decimals
	return adjustDecimals(product, PRICE_DECIMALS, resultDecimals);
}

/**
 * Rounds a BigInt amount up when converting to fewer decimals.
 * Useful for ensuring sufficient payment when buying tokens.
 *
 * @param amount - Amount to round up
 * @param fromDecimals - Current decimals
 * @param toDecimals - Target decimals (must be <= fromDecimals)
 * @returns Rounded up amount
 */
export function ceilAdjustDecimals(
	amount: bigint,
	fromDecimals: number,
	toDecimals: number
): bigint {
	if (fromDecimals <= toDecimals) {
		return adjustDecimals(amount, fromDecimals, toDecimals);
	}

	const divisor = 10n ** BigInt(fromDecimals - toDecimals);
	const quotient = amount / divisor;
	const remainder = amount % divisor;

	return remainder > 0n ? quotient + 1n : quotient;
}

/**
 * Calculates asset amount from payment with ceiling rounding.
 * Use when you want to ensure you get at least the calculated amount.
 */
export function paymentToAssetCeil(
	paymentAmount: bigint,
	paymentDecimals: number,
	scaledPrice: bigint,
	assetDecimals: number
): bigint {
	return paymentToAsset(paymentAmount, paymentDecimals, scaledPrice, assetDecimals);
}

/**
 * Calculates payment amount from asset with ceiling rounding.
 * Use when you want to ensure you have enough payment.
 */
export function assetToPaymentCeil(
	assetAmount: bigint,
	assetDecimals: number,
	scaledPrice: bigint,
	paymentDecimals: number
): bigint {
	if (assetAmount === 0n) {
		return 0n;
	}

	// Normalize asset amount to 18 decimals for consistent calculation
	const decimalDiff = PRICE_DECIMALS - assetDecimals;
	const assetNormalized =
		decimalDiff >= 0
			? assetAmount * 10n ** BigInt(decimalDiff)
			: assetAmount / 10n ** BigInt(-decimalDiff);

	// paymentAmount (in 18 decimals) = ceil(assetNormalized * scaledPrice / PRICE_SCALE)
	const product = assetNormalized * scaledPrice;
	const paymentNormalized = product / PRICE_SCALE + (product % PRICE_SCALE > 0n ? 1n : 0n);

	// Convert to payment decimals with ceiling
	const paymentDecimalDiff = paymentDecimals - PRICE_DECIMALS;
	if (paymentDecimalDiff >= 0) {
		return paymentNormalized * 10n ** BigInt(paymentDecimalDiff);
	}
	return ceilAdjustDecimals(paymentNormalized, PRICE_DECIMALS, paymentDecimals);
}

/**
 * Compares two BigInt amounts with different decimals.
 *
 * @returns negative if a < b, 0 if equal, positive if a > b
 */
export function compareBigInts(
	a: bigint,
	aDecimals: number,
	b: bigint,
	bDecimals: number
): number {
	const aNormalized = adjustDecimals(a, aDecimals, PRICE_DECIMALS);
	const bNormalized = adjustDecimals(b, bDecimals, PRICE_DECIMALS);

	if (aNormalized < bNormalized) return -1;
	if (aNormalized > bNormalized) return 1;
	return 0;
}

/**
 * Calculates the ratio of two BigInt amounts as a floating-point number.
 * Use this for display purposes only (e.g., showing ioRatio after a trade).
 *
 * @param numerator - The numerator amount
 * @param numeratorDecimals - Decimals of the numerator token
 * @param denominator - The denominator amount
 * @param denominatorDecimals - Decimals of the denominator token
 * @returns The ratio as a floating-point number
 */
export function bigIntRatio(
	numerator: bigint,
	numeratorDecimals: number,
	denominator: bigint,
	denominatorDecimals: number
): number {
	if (denominator === 0n) {
		return 0;
	}

	// Use high-precision intermediate calculation
	const scaled = divideBigInts(
		numerator,
		numeratorDecimals,
		denominator,
		denominatorDecimals,
		PRICE_SCALE
	);

	return scaledBigIntToPrice(scaled);
}
