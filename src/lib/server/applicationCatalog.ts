import { env } from '$env/dynamic/private';
import {
	buildNetworkCatalogFromRegistry,
	replaceNetworkCatalog,
	type Network
} from '$lib/config/networks';
import { getServerTokenCatalog } from '$lib/server/tokenCatalog';

const CACHE_TTL_MS = 60_000;
const REGISTRY_REPOSITORY_RAW_URL =
	'https://raw.githubusercontent.com/ST0x-Technology/st0x.registry';
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

type RegistryMetadata = { source_commit?: unknown };

let cachedNetworks: Network[] = [];
let cacheExpiresAt = 0;
let inFlight: Promise<Network[]> | null = null;

function apiConfig(): { url: string; authorization: string } {
	const url = env.ST0X_API_URL?.replace(/\/+$/, '');
	const key = env.ST0X_API_KEY;
	const secret = env.ST0X_API_SECRET;
	if (!url || !key || !secret) throw new Error('ST0X REST API registry is not configured');
	return { url, authorization: `Basic ${btoa(`${key}:${secret}`)}` };
}

async function fetchNetworkCatalog(): Promise<Network[]> {
	const [tokens, config] = await Promise.all([
		getServerTokenCatalog(),
		Promise.resolve(apiConfig())
	]);
	const metadataResponse = await fetch(`${config.url}/registry`, {
		headers: { Accept: 'application/json', Authorization: config.authorization },
		cache: 'no-store'
	});
	if (!metadataResponse.ok) {
		throw new Error(`Registry metadata request failed with HTTP ${metadataResponse.status}`);
	}
	const metadata = (await metadataResponse.json()) as RegistryMetadata;
	const commit = metadata.source_commit;
	if (typeof commit !== 'string' || !COMMIT_SHA_PATTERN.test(commit)) {
		throw new Error('REST API registry metadata has no valid source commit');
	}

	const registryUrl = `${REGISTRY_REPOSITORY_RAW_URL}/${commit}/registry`;
	const catalog = await buildNetworkCatalogFromRegistry(registryUrl, tokens);
	replaceNetworkCatalog(catalog);
	cachedNetworks = catalog;
	cacheExpiresAt = Date.now() + CACHE_TTL_MS;
	return catalog;
}

export async function getServerNetworkCatalog(): Promise<Network[]> {
	if (cachedNetworks.length > 0 && Date.now() < cacheExpiresAt) return cachedNetworks;
	if (!inFlight) {
		inFlight = fetchNetworkCatalog()
			.catch((error) => {
				if (cachedNetworks.length === 0) throw error;
				console.warn('[network-catalog] Refresh failed; serving stale catalog:', error);
				cacheExpiresAt = Date.now() + 10_000;
				return cachedNetworks;
			})
			.finally(() => {
				inFlight = null;
			});
	}
	return inFlight;
}

export async function getServerApplicationCatalog() {
	const [tokenCatalog, networkCatalog] = await Promise.all([
		getServerTokenCatalog(),
		getServerNetworkCatalog()
	]);
	return { tokenCatalog, networkCatalog };
}

export async function ensureServerApplicationCatalog(): Promise<void> {
	await getServerApplicationCatalog();
}
