import { browser } from '$app/environment';

const ACCESS_CODE_KEY = 'st0x_access_code';

// Access code format: ST0X-XXXX-XXXX (where X is alphanumeric, excluding confusing chars)
const ACCESS_CODE_PATTERN = /^ST0X-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i;

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
		// Check both utm_campaign and ref params
		const code = urlParams.get('utm_campaign') || urlParams.get('ref');

		if (code && isValidAccessCodeFormat(code)) {
			const normalized = code.trim().toUpperCase();
			storeAccessCode(normalized);
			return normalized;
		}
	} catch {
		// Ignore errors
	}

	return null;
}
