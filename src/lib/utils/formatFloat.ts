import { Float } from '@rainlanguage/float';

/**
 * Formats a hex value using Float with the specified number of decimals
 * @param hexValue - Hex string to format (e.g. "0x...")
 * @param decimals - Number of decimal places (default 18)
 * @returns Formatted decimal string
 */
export function formatWithFloat(hexValue: string, decimals: number = 18): string {
	try {
		const floatResult = Float.fromHex(hexValue as `0x${string}`);
		if (floatResult.error) {
			console.error('Float.fromHex error:', floatResult.error);
			return hexValue;
		}
		const fixedDecimalResult = floatResult.value!.abs().value!.toFixedDecimalLossy(decimals);
		if (fixedDecimalResult.error) {
			console.error('toFixedDecimal error:', fixedDecimalResult.error);
			return hexValue;
		}
		// Convert bigint to string with decimal formatting
		const bigIntValue = fixedDecimalResult.value!;
		const strValue = bigIntValue.toString();
		// Add decimal point
		if (strValue.length <= decimals) {
			return '0.' + '0'.repeat(decimals - strValue.length) + strValue;
		}
		const intPart = strValue.slice(0, strValue.length - decimals);
		const decPart = strValue.slice(strValue.length - decimals);
		return intPart + '.' + decPart;
	} catch (error) {
		console.error('Error formatting with Float:', error);
		return hexValue;
	}
}
