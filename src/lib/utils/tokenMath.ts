import { formatUnits } from 'viem';
import { Float } from '@rainlanguage/float';

export type AmountLike = bigint | string | number | null | undefined;

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
		// This is a Float hex value, convert it using Float API
		try {
			const hexValue = valueStr as `0x${string}`;
			const floatResult = Float.fromHex(hexValue);
			if (floatResult.error || !floatResult.value) {
				console.warn('Float conversion error:', floatResult.error);
				return fallback ?? null;
			}

			const parsedDecimals = Number(decimals ?? 0);
			let floatValue = floatResult.value;
			let isNegative = false;

			const zeroResult = Float.fromHex(
				'0x0000000000000000000000000000000000000000000000000000000000000000'
			);
			if (!zeroResult.error && zeroResult.value) {
				const comparison = floatValue.lt(zeroResult.value);
				if (!comparison.error) {
					isNegative = comparison.value;
				}
			}

			if (isNegative) {
				const absResult = floatValue.abs();
				if (absResult.error || !absResult.value) {
					return fallback ?? null;
				}
				floatValue = absResult.value;
			}

			const fixedDecimalResult = floatValue.toFixedDecimalLossy(parsedDecimals);
			if (fixedDecimalResult.error || !fixedDecimalResult.value) {
				return fallback ?? null;
			}

			const fixedValue = fixedDecimalResult.value.value;
			const strValue = fixedValue.toString();
			let result: number;

			// Format with decimals
			if (strValue.length <= parsedDecimals) {
				result = Number.parseFloat(
					'0.' + '0'.repeat(parsedDecimals - strValue.length) + strValue
				);
			} else {
				const intPart = strValue.slice(0, strValue.length - parsedDecimals);
				const decPart = strValue.slice(strValue.length - parsedDecimals);
				result = Number.parseFloat(intPart + '.' + decPart);
			}

			if (!Number.isFinite(result)) {
				return fallback ?? null;
			}

			if (isNegative && !absolute) {
				result = -result;
			} else if (absolute) {
				result = Math.abs(result);
			}

			// Check if value is reasonable
			if (Number.isFinite(result) && result > 0 && result < 1e15) {
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
		if (Number.isFinite(num) && num > 0) {
			// Check if this looks like a decimal value rather than wei
			// Wei values are typically very large (18+ digits), decimal strings are typically < 15 digits
			const isLikelyWei = trimmed.length > 15 && !trimmed.includes('.');
			if (!isLikelyWei && trimmed.length <= 30) {
				// This looks like a decimal value, return as-is
				return absolute && num < 0 ? Math.abs(num) : num;
			}
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
	usdcAmount: number | null | undefined,
	tokenAmount: number | null | undefined
): number | null {
	if (usdcAmount === null || usdcAmount === undefined) return null;
	if (tokenAmount === null || tokenAmount === undefined) return null;
	if (!Number.isFinite(usdcAmount) || !Number.isFinite(tokenAmount)) return null;
	if (usdcAmount <= 0 || tokenAmount <= 0) return null;
	const price = usdcAmount / tokenAmount;
	return Number.isFinite(price) ? price : null;
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
	if (input === quote && output === asset) return 'bid';
	if (input === asset && output === quote) return 'ask';
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
	usdc: number;
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
		inputChange?.vault?.token?.decimals ?? (side === 'ask' ? assetDecimals : quoteDecimals)
	);
	const outputDecimals = Number(
		outputChange?.vault?.token?.decimals ?? (side === 'ask' ? quoteDecimals : assetDecimals)
	);

	let tokens: number | null = null;
	let usdc: number | null = null;

	if (side === 'bid') {
		usdc = toDecimal(inputChange?.amount ?? null, inputDecimals, { absolute: true });
		tokens = toDecimal(outputChange?.amount ?? null, outputDecimals, { absolute: true });
	} else {
		tokens = toDecimal(inputChange?.amount ?? null, inputDecimals, { absolute: true });
		usdc = toDecimal(outputChange?.amount ?? null, outputDecimals, { absolute: true });
	}

	if (tokens === null || usdc === null) return null;
	if (!Number.isFinite(tokens) || !Number.isFinite(usdc)) return null;
	if (tokens <= 0 || usdc <= 0) return null;

	const price = computePrice(usdc, tokens);
	if (price === null) return null;

	return { side, tokens, usdc, price };
}

export const RATIO_SCALE = 1e18;

export function ratioToNumber(value: bigint | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return null;
	const scaled = numeric / RATIO_SCALE;
	if (!Number.isFinite(scaled) || scaled <= 0) return null;
	return scaled;
}

export interface QuoteLike {
	inputTokenAddress: string;
	outputTokenAddress: string;
	ratio: bigint;
}

export interface QuoteMetrics {
	assetAddress: string;
	side: MarketSide;
	usdcPerToken: number;
	tokensPerUsdc: number;
}

export function describeQuote(quote: QuoteLike, usdcAddress: string): QuoteMetrics | null {
	const input = normalizeAddress(quote.inputTokenAddress);
	const output = normalizeAddress(quote.outputTokenAddress);
	const usdc = normalizeAddress(usdcAddress);
	if (!input || !output || !usdc) return null;
	const ratio = ratioToNumber(quote.ratio);
	if (ratio === null) return null;

	if (input === usdc && output !== usdc) {
		// ASK order: giving away output token to acquire USDC input (seller offering to sell)
		const usdcPerToken = ratio;
		if (!Number.isFinite(usdcPerToken) || usdcPerToken <= 0) return null;
		const tokensPerUsdc = usdcPerToken === 0 ? NaN : 1 / usdcPerToken;
		if (!Number.isFinite(tokensPerUsdc) || tokensPerUsdc <= 0) return null;
		return {
			assetAddress: output,
			side: 'ask',
			usdcPerToken,
			tokensPerUsdc
		};
	}

	if (output === usdc && input !== usdc) {
		// BID order: giving away input token to acquire USDC output (buyer offering to buy)
		const usdcPerToken = 1 / ratio;
		if (!Number.isFinite(usdcPerToken) || usdcPerToken <= 0) return null;
		const tokensPerUsdc = usdcPerToken === 0 ? NaN : 1 / usdcPerToken;
		if (!Number.isFinite(tokensPerUsdc) || tokensPerUsdc <= 0) return null;
		return {
			assetAddress: input,
			side: 'bid',
			usdcPerToken,
			tokensPerUsdc
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
	const usdcAddress = normalizeAddress(quoteToken.address);
	if (!usdcAddress) return null;

	const inputToken = trade.inputVaultBalanceChange?.vault?.token;
	const outputToken = trade.outputVaultBalanceChange?.vault?.token;

	const candidates = [inputToken, outputToken].filter((token) => token?.address);
	const assetCandidate = candidates.find((token) => !addressesEqual(token?.address, usdcAddress));
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
			address: usdcAddress,
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
