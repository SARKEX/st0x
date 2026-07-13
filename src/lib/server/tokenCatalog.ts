import { env } from '$env/dynamic/private';
import type { ApiToken } from '$lib/api/st0xApi';
import { replaceTokenCatalog, type CategorizedToken } from '$lib/config/tokens';
import { normalizeApiTokens } from '$lib/queries/tokens';

const CACHE_TTL_MS = 60_000;

let cachedTokens: CategorizedToken[] = [];
let cacheExpiresAt = 0;
let inFlight: Promise<CategorizedToken[]> | null = null;

function getApiConfig(): { url: string; authorization: string } {
	const url = env.ST0X_API_URL?.replace(/\/+$/, '');
	const key = env.ST0X_API_KEY;
	const secret = env.ST0X_API_SECRET;
	if (!url || !key || !secret) {
		throw new Error('ST0X REST API token catalog is not configured');
	}

	return {
		url,
		authorization: `Basic ${btoa(`${key}:${secret}`)}`
	};
}

async function fetchTokenCatalog(): Promise<CategorizedToken[]> {
	const config = getApiConfig();
	const response = await fetch(`${config.url}/v1/tokens`, {
		headers: {
			Accept: 'application/json',
			Authorization: config.authorization
		}
	});

	if (!response.ok) {
		throw new Error(`Token catalog request failed with HTTP ${response.status}`);
	}

	const tokens = normalizeApiTokens((await response.json()) as ApiToken[]);
	const st0xTokens = tokens.filter((token) => token.category === 'ST0x');
	if (st0xTokens.length === 0) {
		throw new Error('Token catalog response did not contain any ST0x tokens');
	}

	replaceTokenCatalog(st0xTokens);
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
