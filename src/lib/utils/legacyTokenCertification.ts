import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';

/** OffchainAssetReceiptVault certification helpers for legacy migration tokens. */
export const LEGACY_TOKEN_CERTIFICATION_ABI = [
	{
		name: 'isCertificationExpired',
		type: 'function',
		stateMutability: 'view',
		inputs: [],
		outputs: [{ type: 'bool' }]
	}
] as const;

export const CERTIFICATION_EXPIRED_ERROR_SELECTOR = '0xfe720f78';

export const LEGACY_TOKEN_CERTIFICATION_EXPIRED_MESSAGE =
	'Legacy token transfers are temporarily paused because on-chain certification has expired. Migration swaps will work again after certification is renewed. Please try again later or contact support if this persists.';

const certificationClient = createPublicClient({
	chain: base,
	transport: http()
});

/** Returns true when the legacy vault's transfer certification window has expired. */
export async function isLegacyTokenCertificationExpired(
	tokenAddress: Address
): Promise<boolean> {
	try {
		return await certificationClient.readContract({
			address: tokenAddress,
			abi: LEGACY_TOKEN_CERTIFICATION_ABI,
			functionName: 'isCertificationExpired'
		});
	} catch {
		// Non-OARV addresses or RPC failures — do not block unrelated flows.
		return false;
	}
}

/** Detect CertificationExpired(address,address) in SDK / RPC error strings. */
export function isCertificationExpiredError(message: string | undefined): boolean {
	if (!message) return false;
	const normalized = message.toLowerCase();
	return (
		normalized.includes(CERTIFICATION_EXPIRED_ERROR_SELECTOR) ||
		normalized.includes('certificationexpired')
	);
}

export function legacyTokenCertificationExpiredMessage(
	tokenSymbol?: string
): string {
	if (!tokenSymbol) return LEGACY_TOKEN_CERTIFICATION_EXPIRED_MESSAGE;
	return `${tokenSymbol} transfers are temporarily paused because on-chain certification has expired. Migration swaps will work again after certification is renewed. Please try again later or contact support if this persists.`;
}
