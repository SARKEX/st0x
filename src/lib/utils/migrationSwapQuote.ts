import { parseUnits } from 'viem';

/** Decimal scale used when interpreting maker IO ratio strings as fixed-point. */
export const MIGRATION_RATIO_SCALE = 18;

/**
 * Floor wrapped receive from legacy pay using the maker IO ratio.
 * Maker ioRatio is input/output (legacy paid per wrapped received).
 */
export function migrationReceiveWei(payWei: bigint, ioRatio: string): bigint {
	const ratioWei = parseUnits(ioRatio, MIGRATION_RATIO_SCALE);
	if (ratioWei <= 0n || payWei <= 0n) return 0n;
	return (payWei * 10n ** BigInt(MIGRATION_RATIO_SCALE)) / ratioWei;
}

/**
 * Ceiling-safe legacy pay cap from wrapped maxOutput and maker IO ratio.
 * Uses floor division so we never request more wrapped than maxOutput.
 */
export function migrationPayCapWei(maxOutputWei: bigint, ioRatio: string): bigint {
	const ratioWei = parseUnits(ioRatio, MIGRATION_RATIO_SCALE);
	if (ratioWei <= 0n || maxOutputWei <= 0n) return 0n;
	return (maxOutputWei * ratioWei) / 10n ** BigInt(MIGRATION_RATIO_SCALE);
}
