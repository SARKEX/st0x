import { browser } from '$app/environment';

const ACCESS_CODE_KEY = 'st0x_access_code';
const REFERRAL_CODE_KEY = 'st0x_referral_code';

// Access code format: ST0X-XXXX-XXXX (where X is alphanumeric, excluding confusing chars)
const ACCESS_CODE_PATTERN = /^ST0X-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i;

// Referral code format: st0x-ref-xxxxxx (6 lowercase alphanumeric chars)
const REFERRAL_CODE_PATTERN = /^st0x-ref-[a-z0-9]{6}$/i;

/**
 * Validates if a string looks like a valid access code format
 */
export function isValidAccessCodeFormat(code: string): boolean {
	if (!code) return false;
	return ACCESS_CODE_PATTERN.test(code.trim().toUpperCase());
}

/**
 * Gets the stored access code from localStorage
 */
export function getStoredAccessCode(): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(ACCESS_CODE_KEY);
	} catch {
		return null;
	}
}

/**
 * Stores an access code in localStorage
 */
export function storeAccessCode(code: string): void {
	if (!browser) return;
	try {
		const normalized = code.trim().toUpperCase();
		if (isValidAccessCodeFormat(normalized)) {
			localStorage.setItem(ACCESS_CODE_KEY, normalized);
		}
	} catch {
		// Ignore localStorage errors
	}
}

/**
 * Clears the stored access code from localStorage
 */
export function clearStoredAccessCode(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(ACCESS_CODE_KEY);
	} catch {
		// Ignore localStorage errors
	}
}

/**
 * Checks URL params for access code and stores it if valid
 * Only stores if the param value looks like an access code (ST0X-XXXX-XXXX)
 * This prevents storing other UTM values like campaign names
 */
export function checkAndStoreAccessCodeFromUrl(): string | null {
	if (!browser) return null;

	try {
		const urlParams = new URLSearchParams(window.location.search);
		// Check both utm_campaign and ref params for access codes
		const code = urlParams.get('utm_campaign') || urlParams.get('ref');

		if (code && isValidAccessCodeFormat(code)) {
			const normalized = code.trim().toUpperCase();
			storeAccessCode(normalized);
			return normalized;
		}

		// Also check for referral code in ref param
		const refCode = urlParams.get('ref');
		if (refCode && isValidReferralCodeFormat(refCode)) {
			storeReferralCode(refCode.toLowerCase());
		}
	} catch {
		// Ignore errors
	}

	return null;
}

// ===== Referral Code Functions =====

/**
 * Validates if a string looks like a valid referral code format
 */
export function isValidReferralCodeFormat(code: string): boolean {
	if (!code) return false;
	return REFERRAL_CODE_PATTERN.test(code.trim());
}

/**
 * Gets the stored referral code from localStorage
 */
export function getStoredReferralCode(): string | null {
	if (!browser) return null;
	try {
		return localStorage.getItem(REFERRAL_CODE_KEY);
	} catch {
		return null;
	}
}

/**
 * Stores a referral code in localStorage
 */
export function storeReferralCode(code: string): void {
	if (!browser) return;
	try {
		const normalized = code.trim().toLowerCase();
		if (isValidReferralCodeFormat(normalized)) {
			localStorage.setItem(REFERRAL_CODE_KEY, normalized);
		}
	} catch {
		// Ignore localStorage errors
	}
}

/**
 * Clears the stored referral code from localStorage
 */
export function clearStoredReferralCode(): void {
	if (!browser) return;
	try {
		localStorage.removeItem(REFERRAL_CODE_KEY);
	} catch {
		// Ignore localStorage errors
	}
}
