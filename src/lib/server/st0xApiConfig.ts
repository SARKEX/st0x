import type { St0xCredentialLabel } from '$lib/types/st0x';

export interface St0xApiConfig {
	apiBase: string;
	authHeader: string;
	credentialLabel: St0xCredentialLabel;
}

type St0xEnvironment = Record<string, string | undefined>;

function basicAuth(key: string, secret: string): string {
	return 'Basic ' + btoa(`${key}:${secret}`);
}

function getDedicatedApiConfig(
	environment: St0xEnvironment,
	keyName: string,
	secretName: string,
	credentialLabel: Exclude<St0xCredentialLabel, 'general'>
): St0xApiConfig | null {
	const url = environment.ST0X_API_URL;
	if (!url) return null;

	const dedicatedKey = environment[keyName];
	const dedicatedSecret = environment[secretName];
	if (dedicatedKey || dedicatedSecret) {
		if (!dedicatedKey || !dedicatedSecret) return null;
		return {
			apiBase: url.replace(/\/+$/, ''),
			authHeader: basicAuth(dedicatedKey, dedicatedSecret),
			credentialLabel
		};
	}

	const key = environment.ST0X_API_KEY;
	const secret = environment.ST0X_API_SECRET;
	if (!key || !secret) return null;
	return {
		apiBase: url.replace(/\/+$/, ''),
		authHeader: basicAuth(key, secret),
		credentialLabel: 'general'
	};
}

/**
 * Resolve the dedicated public-price credential when configured.
 *
 * A partially configured dedicated pair is rejected instead of mixing it with
 * the general credential. The general pair remains a deployment-compatible
 * fallback while operators roll out the isolated price budget.
 */
export function getSt0xPricesApiConfig(environment: St0xEnvironment): St0xApiConfig | null {
	return getDedicatedApiConfig(
		environment,
		'ST0X_PRICES_API_KEY',
		'ST0X_PRICES_API_SECRET',
		'prices'
	);
}

/**
 * Resolve the dedicated public-activity credential when configured.
 *
 * Activity pagination has a separate budget so a cold 30-day refresh cannot
 * consume the browser proxy or global-orderbook allowance.
 */
export function getSt0xActivityApiConfig(environment: St0xEnvironment): St0xApiConfig | null {
	return getDedicatedApiConfig(
		environment,
		'ST0X_ACTIVITY_API_KEY',
		'ST0X_ACTIVITY_API_SECRET',
		'activity'
	);
}
