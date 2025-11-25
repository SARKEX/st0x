import { formatUnits } from 'viem';
import { Float } from '@rainlanguage/float';

export type AmountLike = bigint | string | number | null | undefined;

/**
 * Parses a hex-encoded Float value into a BigInt amount.
 *
 * @param hexAmount - Hex-encoded Float value (e.g., from Rain orderbook)
 * @param decimals - Token decimals for the amount
 * @param useAbsolute - Whether to take absolute value (default: false)
 * @returns BigInt amount in token decimals, or 0n on error
 */
export function parseFloatHex(hexAmount: string, decimals: number, useAbsolute = false): bigint {
	try {
		const floatResult = Float.fromHex(hexAmount as `0x${string}`);
		if (floatResult.error || !floatResult.value) {
			return 0n;
		}

		let float = floatResult.value;

		// Optionally take absolute value
		if (useAbsolute) {
			const absResult = float.abs();
			if (absResult.error || !absResult.value) {
				return 0n;
			}
			float = absResult.value;
		}

		const fixedResult = float.toFixedDecimalLossy(decimals);
		if (fixedResult.error || !fixedResult.value) {
			return 0n;
		}

		const fdValue = fixedResult.value;
		const fdValueObj = fdValue as unknown as Record<string, unknown>;
		if (typeof fdValueObj?.value === 'string') {
			return BigInt(fdValueObj.value as string);
		}
		return 0n;
	} catch (error) {
		console.warn('Failed to parse Float hex:', error);
		return 0n;
	}
}

export function normalizeAddress(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.toLowerCase();
}

export function addressesEqual(
	a: string | null | undefined,
	b: string | null | undefined
): boolean {
	const left = normalizeAddress(a);
	const right = normalizeAddress(b);
	return left !== null && right !== null && left === right;
}

export function toBigInt(value: AmountLike): bigint | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'bigint') return value;
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return null;
		try {
			return BigInt(Math.trunc(value));
		} catch {
			return null;
		}
	}
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;
		try {
			return BigInt(trimmed);
		} catch {
			return null;
		}
	}
	return null;
}

export function absBigInt(value: bigint): bigint {
	return value < 0n ? -value : value;
}

export interface DecimalOptions {
	absolute?: boolean;
	fallback?: number | null;
}

export function toDecimal(
	value: AmountLike,
	decimals: number | null | undefined,
	options: DecimalOptions = {}
): number | null {
	const { absolute = false, fallback = null } = options;

	// Check if this is a Float hex string (32 bytes = 64 hex chars + '0x')
	const valueStr = typeof value === 'string' ? value : value?.toString() ?? '';
	if (valueStr.startsWith('0x') && valueStr.length === 66) {
		try {
			const hexValue = valueStr as `0x${string}`;
			const floatResult = Float.fromHex(hexValue);
			if (floatResult.error || !floatResult.value) {
				console.warn('Float conversion error:', floatResult.error);
				return fallback ?? null;
			}

			const formattedResult = floatResult.value.format();
			if (formattedResult.error || !formattedResult.value) {
				console.warn('Float formatting error:', formattedResult.error);
				return fallback ?? null;
			}

			let result = Number.parseFloat(formattedResult.value.toString());
			if (!Number.isFinite(result)) {
				return fallback ?? null;
			}

			if (absolute) {
				result = Math.abs(result);
			} else if (result < 0) {
				return fallback ?? null;
			}

			if (result > 0 && result < 1e15) {
				return result;
			}
			return fallback ?? null;
		} catch (error) {
			console.warn('Float conversion failed:', error);
			return fallback ?? null;
		}
	}

	// Check if this is already a decimal string (from subgraph/API, not wei-scaled)
	// Decimal strings are typically small numbers like "1", "75", "123.45"
	if (typeof value === 'string') {
		const trimmed = value.trim();
		const num = Number.parseFloat(trimmed);
		const decimalsValue = Number(decimals ?? 0);
		const looksDecimal = trimmed.includes('.') || decimalsValue === 0;
		if (looksDecimal && Number.isFinite(num) && trimmed.length <= 30) {
			return absolute && num < 0 ? Math.abs(num) : num;
		}
	}

	// Standard bigint conversion for regular amounts
	const big = toBigInt(value);
	if (big === null) return fallback ?? null;
	const normalised = absolute ? absBigInt(big) : big;
	const parsedDecimals = Number(decimals ?? 0);

	// Validate decimals is reasonable (typically 0-18 for tokens, up to 30 for edge cases)
	if (!Number.isFinite(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > 30) {
		console.warn('Invalid decimals value:', parsedDecimals);
		return fallback ?? null;
	}

	// Check for astronomically large values
	// Calculate max based on decimals: allow up to 1e15 as final result
	// For 18 decimals: 1e15 * 1e18 = 1e33, but cap at 1e24 (practical max)
	// For 6 decimals: 1e15 * 1e6 = 1e21
	const maxWeiValue = BigInt('1000000000000000000000000'); // 1e24 - absolute maximum
	if (normalised > maxWeiValue) {
		console.warn('Value exceeds maximum safe wei:', normalised);
		return fallback ?? null;
	}

	try {
		const formatted = Number.parseFloat(formatUnits(normalised, parsedDecimals));
		if (!Number.isFinite(formatted)) {
			return fallback ?? null;
		}
		// Additional sanity check for the final result
		if (formatted > 1e15) {
			console.warn('Converted value suspiciously large:', formatted, 'decimals:', parsedDecimals);
			return fallback ?? null;
		}
		return formatted;
	} catch {
		return fallback ?? null;
	}
}

export function computePrice(
	quoteAmount: number | null | undefined,
	tokenAmount: number | null | undefined
): number | null {
	if (quoteAmount === null || quoteAmount === undefined) return null;
	if (tokenAmount === null || tokenAmount === undefined) return null;
	if (!Number.isFinite(quoteAmount) || !Number.isFinite(tokenAmount)) return null;
	if (quoteAmount <= 0 || tokenAmount <= 0) return null;
	const price = quoteAmount / tokenAmount;
	return Number.isFinite(price) ? price : null;
}

/**
 * Checks if a token is a payment/settlement token (like USDC, USDT, DAI).
 *
 * Can check by symbol string matching or by comparing against a network's default payment token.
 *
 * @param token - Token symbol string, TokenDescriptor, or token-like object with symbol/address
 * @param networkPaymentToken - Optional network's default payment token to check against
 * @returns true if the token is a payment token
 */
export function isPaymentToken(
	token: string | { symbol?: string | null; address?: string | null },
	networkPaymentToken?: { symbol?: string | null; address?: string | null }
): boolean {
	const symbol = typeof token === 'string' ? token : token.symbol;
	const address = typeof token === 'string' ? null : token.address;

	// Check against network default if provided
	if (networkPaymentToken) {
		if (address && networkPaymentToken.address) {
			if (addressesEqual(address, networkPaymentToken.address)) {
				return true;
			}
		}
		if (symbol && networkPaymentToken.symbol) {
			if (symbol.toUpperCase() === networkPaymentToken.symbol.toUpperCase()) {
				return true;
			}
		}
	}

	// Fallback to common payment token symbols
	if (!symbol) return false;
	const paymentSymbols = ['USDC', 'USDT', 'DAI', 'USD'];
	return paymentSymbols.some((pt) => symbol.toUpperCase().includes(pt));
}

export interface TokenDescriptor {
	address: string;
	decimals: number;
	symbol?: string | null;
}

export interface PairDescriptor {
	asset: TokenDescriptor;
	quote: TokenDescriptor;
}

export type MarketSide = 'bid' | 'ask';

export function classifyFlow(
	inputAddress: string | null | undefined,
	outputAddress: string | null | undefined,
	pair: PairDescriptor
): MarketSide | null {
	const input = normalizeAddress(inputAddress);
	const output = normalizeAddress(outputAddress);
	const asset = normalizeAddress(pair.asset.address);
	const quote = normalizeAddress(pair.quote.address);
	if (!input || !output || !asset || !quote) return null;
	// BID: buying asset (input=asset, output=quote/USDC)
	if (input === asset && output === quote) return 'bid';
	// ASK: selling asset (input=quote/USDC, output=asset)
	if (input === quote && output === asset) return 'ask';
	return null;
}

export interface VaultBalanceChangeLike {
	amount?: string | null;
	vault?: {
		token?: { address?: string | null; decimals?: number | null; symbol?: string | null } | null;
	} | null;
}

export interface TradeLike {
	inputVaultBalanceChange?: VaultBalanceChangeLike | null;
	outputVaultBalanceChange?: VaultBalanceChangeLike | null;
}

export interface ParsedTradeAmounts {
	side: MarketSide;
	tokens: number;
	quote: number;
	price: number;
}

export function parseTradeAmounts(
	trade: TradeLike | null | undefined,
	pair: PairDescriptor
): ParsedTradeAmounts | null {
	if (!trade) return null;
	const inputChange = trade.inputVaultBalanceChange;
	const outputChange = trade.outputVaultBalanceChange;
	const side = classifyFlow(
		inputChange?.vault?.token?.address,
		outputChange?.vault?.token?.address,
		pair
	);
	if (!side) return null;

	const assetDecimals = Number(pair.asset.decimals ?? 18);
	const quoteDecimals = Number(pair.quote.decimals ?? 6);

	const inputDecimals = Number(
		inputChange?.vault?.token?.decimals ?? (side === 'bid' ? assetDecimals : quoteDecimals)
	);
	const outputDecimals = Number(
		outputChange?.vault?.token?.decimals ?? (side === 'bid' ? quoteDecimals : assetDecimals)
	);

	let tokens: number | null = null;
	let quoteAmount: number | null = null;

	// BID: input=asset, output=quote
	if (side === 'bid') {
		tokens = toDecimal(inputChange?.amount ?? null, inputDecimals, { absolute: true });
		quoteAmount = toDecimal(outputChange?.amount ?? null, outputDecimals, { absolute: true });
	} else {
		// ASK: input=quote, output=asset
		quoteAmount = toDecimal(inputChange?.amount ?? null, inputDecimals, { absolute: true });
		tokens = toDecimal(outputChange?.amount ?? null, outputDecimals, { absolute: true });
	}

	if (tokens === null || quoteAmount === null) return null;
	if (!Number.isFinite(tokens) || !Number.isFinite(quoteAmount)) return null;
	if (tokens <= 0 || quoteAmount <= 0) return null;

	const price = computePrice(quoteAmount, tokens);
	if (price === null) return null;

	return { side, tokens, quote: quoteAmount, price };
}

export function ratioToNumber(value: string | null | undefined): number | null {
	if (typeof value !== 'string' || value.length === 0) return null;

	// Handle hex-encoded Float strings (0x + 64 hex chars)
	if (value.startsWith('0x') && value.length === 66) {
		try {
			const floatResult = Float.fromHex(value as `0x${string}`);
			if (floatResult.error || !floatResult.value) {
				console.warn('Float conversion error:', floatResult.error);
				return null;
			}

			const formattedResult = floatResult.value.format();
			if (formattedResult.error || !formattedResult.value) {
				console.warn('Float ratio formatting error:', formattedResult.error);
				return null;
			}

			const numeric = Number.parseFloat(formattedResult.value.toString());
			if (!Number.isFinite(numeric)) return null;
			if (numeric <= 0) return null;
			// Additional sanity check: the result should be a reasonable number
			if (numeric >= 1e14) return null;
			return numeric;
		} catch (error) {
			console.warn('Float ratio conversion failed:', error);
			return null;
		}
	}

	return null;
}

export interface QuoteLike {
	inputTokenAddress: string;
	outputTokenAddress: string;
	ratio: string; // Hex-encoded Float string
}

export interface QuoteMetrics {
	assetAddress: string;
	side: MarketSide;
	quotePerAsset: number;
}

export function describeQuote(quote: QuoteLike, quoteTokenAddress: string): QuoteMetrics | null {
	const input = normalizeAddress(quote.inputTokenAddress);
	const output = normalizeAddress(quote.outputTokenAddress);
	const quoteAddress = normalizeAddress(quoteTokenAddress);

	if (!input || !output || !quoteAddress) {
		return null;
	}
	const ratio = ratioToNumber(quote.ratio);
	if (ratio === null) {
		return null;
	}

	if (input === quoteAddress && output !== quoteAddress) {
		// ASK order: giving away output token to acquire quote token input (seller offering to sell)
		const quotePerAsset = ratio;
		if (!Number.isFinite(quotePerAsset) || quotePerAsset <= 0) {
			return null;
		}
		return {
			assetAddress: output,
			side: 'ask',
			quotePerAsset
		};
	}

	if (output === quoteAddress && input !== quoteAddress) {
		// BID order: giving away input token to acquire quote token output (buyer offering to buy)
		const quotePerAsset = 1 / ratio;
		if (!Number.isFinite(quotePerAsset) || quotePerAsset <= 0) {
			return null;
		}
		return {
			assetAddress: input,
			side: 'bid',
			quotePerAsset
		};
	}

	return null;
}

export interface TradeAnalysis extends ParsedTradeAmounts {
	assetAddress: string;
	assetSymbol?: string | null;
}

export type TokenLookup<T extends TokenDescriptor = TokenDescriptor> = (
	address: string | null | undefined
) => T | undefined;

export function createTokenLookup<T extends TokenDescriptor = TokenDescriptor>(
	tokens: T[]
): TokenLookup<T> {
	const map = new Map<string, T>();
	tokens.forEach((token) => {
		const normalised = normalizeAddress(token.address);
		if (normalised) {
			map.set(normalised, token);
		}
	});
	return (address) => {
		const normalised = normalizeAddress(address);
		if (!normalised) return undefined;
		return map.get(normalised);
	};
}

export function analyzeTrade(
	trade: TradeLike | null | undefined,
	quoteToken: TokenDescriptor,
	lookup?: TokenLookup
): TradeAnalysis | null {
	if (!trade) return null;
	const quoteAddress = normalizeAddress(quoteToken.address);
	if (!quoteAddress) return null;

	const inputToken = trade.inputVaultBalanceChange?.vault?.token;
	const outputToken = trade.outputVaultBalanceChange?.vault?.token;

	const candidates = [inputToken, outputToken].filter((token) => token?.address);
	const assetCandidate = candidates.find((token) => !addressesEqual(token?.address, quoteAddress));
	if (!assetCandidate?.address) return null;

	const assetAddress = normalizeAddress(assetCandidate.address);
	if (!assetAddress) return null;

	const assetLookup = lookup?.(assetAddress);
	const assetDecimals = Number(
		assetLookup?.decimals ?? assetCandidate.decimals ?? assetCandidate?.decimals ?? 18
	);

	const pair: PairDescriptor = {
		asset: {
			address: assetAddress,
			decimals: assetDecimals,
			symbol: assetLookup?.symbol ?? assetCandidate.symbol ?? undefined
		},
		quote: {
			address: quoteAddress,
			decimals: Number(quoteToken.decimals ?? 6),
			symbol: quoteToken.symbol ?? undefined
		}
	};

	const parsed = parseTradeAmounts(trade, pair);
	if (!parsed) return null;

	return {
		assetAddress,
		assetSymbol: pair.asset.symbol,
		...parsed
	};
}

// ============================================================================
// RAINDEX URL UTILITIES
// ============================================================================

const RAINDEX_BASE_URL = 'https://v5.raindex.finance';

/**
 * Generate a Raindex URL for an order
 */
export function getRaindexOrderUrl(
	chainId: number,
	orderbookId: string,
	orderHash: string
): string {
	return `${RAINDEX_BASE_URL}/orders/${chainId}-${orderbookId}-${orderHash}`;
}

/**
 * Generate a Raindex URL for a vault
 * Format: {chainId}-{orderbookId}-{vaultSubgraphId}
 *
 * @param chainId - Network chain ID (e.g., 8453 for Base)
 * @param orderbookId - Orderbook contract address
 * @param vaultSubgraphId - The vault's unique subgraph identifier (vault.id), NOT the vault slot number (vault.vaultId)
 */
export function getRaindexVaultUrl(
	chainId: number,
	orderbookId: string,
	vaultSubgraphId: string
): string {
	const normalizedId = vaultSubgraphId.startsWith('0x') ? vaultSubgraphId : `0x${vaultSubgraphId}`;
	return `${RAINDEX_BASE_URL}/vaults/${chainId}-${orderbookId}-${normalizedId}`;
}
