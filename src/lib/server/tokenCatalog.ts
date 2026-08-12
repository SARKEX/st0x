import { env } from '$env/dynamic/private';
import type { ApiToken } from '$lib/api/st0xApi';
import { replaceTokenCatalog, type CategorizedToken } from '$lib/config/tokens';
import { normalizeApiTokens } from '$lib/queries/tokens';
import { getSt0xGeneralApiConfig } from '$lib/server/st0xApiConfig';

const CACHE_TTL_MS = 60_000;

let cachedTokens: CategorizedToken[] = [];
let cacheExpiresAt = 0;
let inFlight: Promise<CategorizedToken[]> | null = null;

function getApiConfig() {
	const config = getSt0xGeneralApiConfig(env);
	if (!config) {
		throw new Error('ST0X REST API token catalog is not configured');
	}
	return config;
}

async function fetchTokenCatalog(): Promise<CategorizedToken[]> {
	const config = getApiConfig();
	const response = await fetch(`${config.apiBase}/v2/tokens`, {
		headers: {
			Accept: 'application/json',
			Authorization: config.authHeader
		},
		cache: 'no-store',
		signal: AbortSignal.timeout(10_000)
	});

	if (!response.ok) {
		throw new Error(`Token catalog request failed with HTTP ${response.status}`);
	}

	const payload: unknown = await response.json();
	if (!Array.isArray(payload)) {
		throw new Error('Token catalog response is not an array');
	}
	const tokens = normalizeApiTokens(payload as ApiToken[]);
	const st0xTokens = tokens.filter((token) => token.category === 'ST0x');
	if (st0xTokens.length === 0) {
		throw new Error('Token catalog response did not contain any ST0x tokens');
	}

	replaceTokenCatalog(tokens);
	cachedTokens = tokens;
	cacheExpiresAt = Date.now() + CACHE_TTL_MS;
	return tokens;
}

export async function getServerTokenCatalog(): Promise<CategorizedToken[]> {
	if (cachedTokens.length > 0 && Date.now() < cacheExpiresAt) return cachedTokens;
	if (!inFlight) {
		inFlight = fetchTokenCatalog()
			.catch((error) => {
				if (cachedTokens.length === 0) throw error;
				console.warn('[token-catalog] Refresh failed; serving stale catalog:', error);
				cacheExpiresAt = Date.now() + 10_000;
				return cachedTokens;
			})
			.finally(() => {
				inFlight = null;
			});
	}
	return inFlight;
}

export async function ensureServerTokenCatalog(): Promise<void> {
	await getServerTokenCatalog();
}
