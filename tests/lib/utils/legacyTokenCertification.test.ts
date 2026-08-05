import { describe, expect, it } from 'vitest';
import {
	CERTIFICATION_EXPIRED_ERROR_SELECTOR,
	isCertificationExpiredError,
	legacyTokenCertificationExpiredMessage
} from '$lib/utils/legacyTokenCertification';

describe('legacyTokenCertification', () => {
	it('detects CertificationExpired revert data in SDK messages', () => {
		const sdkMsg = `Preflight check failed: Order failed simulation: execution reverted, data: ${CERTIFICATION_EXPIRED_ERROR_SELECTOR}00000000000000000000000019f95a84aa1c48a2c6a7b2d5de164331c86d030c`;
		expect(isCertificationExpiredError(sdkMsg)).toBe(true);
	});

	it('detects CertificationExpired by name', () => {
		expect(isCertificationExpiredError('CertificationExpired(address,address)')).toBe(true);
	});

	it('returns false for unrelated errors', () => {
		expect(isCertificationExpiredError('ERC20: insufficient allowance')).toBe(false);
		expect(isCertificationExpiredError(undefined)).toBe(false);
	});

	it('includes token symbol in user-facing message when provided', () => {
		expect(legacyTokenCertificationExpiredMessage('tSPYM')).toContain('tSPYM');
	});
});
