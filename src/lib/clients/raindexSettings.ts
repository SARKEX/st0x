import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

const REGISTRY_MANIFEST_URL = publicEnv.PUBLIC_REGISTRY_URL || '/registry/manifest';
const REGISTRY_REQUEST_TIMEOUT_MS = 5000;

function appOrigin(): string {
	if (browser && typeof window !== 'undefined' && window.location?.origin) {
		return window.location.origin;
	}
	return (
		publicEnv.PUBLIC_APP_URL ||
		(typeof process !== 'undefined' && process.env.VERCEL_URL
			? `https://${process.env.VERCEL_URL}`
			: 'http://127.0.0.1:5173')
	).replace(/\/$/, '');
}

function resolveRegistryManifestUrl(): string {
	return new URL(REGISTRY_MANIFEST_URL, `${appOrigin()}/`).toString();
}

export function settingsUrlFromManifest(manifest: string, manifestUrl: string): string {
	const settingsEntry = manifest
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0 && !line.startsWith('#'));

	if (!settingsEntry) {
		throw new Error('Registry manifest does not contain a settings URL');
	}

	try {
		return new URL(settingsEntry, manifestUrl).toString();
	} catch {
		throw new Error('Registry manifest contains an invalid settings URL');
	}
}

/**
 * Build the browser's Raindex settings from the canonical registry YAML.
 *
 * The REST API uses the local DB sections, but the browser does not provide a
 * database implementation. Remove the complete local DB configuration before
 * handing the otherwise-canonical settings to the SDK.
 */
export function prepareBrowserRaindexSettings(settingsYaml: string): string {
	// Treat untouched scalars as strings while editing the AST. EVM addresses are
	// valid YAML hexadecimal integers, so the default schema would otherwise round
	// their 160-bit values through JS Number when re-serializing the document.
	const document = parseDocument(settingsYaml, { schema: 'failsafe' });
	if (document.errors.length > 0) {
		throw new Error(`Registry settings YAML is invalid: ${document.errors[0].message}`);
	}

	document.delete('local-db-sync');
	document.delete('local-db-remotes');

	const raindexes = document.get('raindexes', true);
	if (isMap(raindexes)) {
		for (const pair of raindexes.items) {
			if (isMap(pair.value)) {
				pair.value.delete('local-db-remote');
			}
		}
	}

	return document.toString();
}

async function fetchText(url: string, label: string, init?: RequestInit): Promise<string> {
	const controller = new AbortController();
	const externalSignal = init?.signal;
	const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
	if (externalSignal?.aborted) {
		abortFromExternalSignal();
	} else {
		externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
	}
	const timeout = setTimeout(
		() => controller.abort(new Error(`Timed out loading ${label}`)),
		REGISTRY_REQUEST_TIMEOUT_MS
	);

	try {
		const response = await fetch(url, { ...init, signal: controller.signal });
		if (!response.ok) {
			throw new Error(`Failed to load ${label} (${response.status})`);
		}
		return response.text();
	} finally {
		clearTimeout(timeout);
		externalSignal?.removeEventListener('abort', abortFromExternalSignal);
	}
}

async function fetchBrowserRaindexSettings(): Promise<string> {
	const manifestUrl = resolveRegistryManifestUrl();
	// The manifest follows the REST API's active registry commit. Bypass the
	// browser cache so an operator RPC rotation is picked up on the next reload.
	const manifest = await fetchText(manifestUrl, 'registry manifest', { cache: 'no-store' });
	const settingsUrl = settingsUrlFromManifest(manifest, manifestUrl);
	const settings = await fetchText(settingsUrl, 'registry settings');
	return prepareBrowserRaindexSettings(settings);
}

let settingsPromise: Promise<string> | null = null;

/** Load and cache the browser-safe view of the canonical registry settings. */
export function getBrowserRaindexSettings(): Promise<string> {
	if (!settingsPromise) {
		settingsPromise = fetchBrowserRaindexSettings().catch((error) => {
			settingsPromise = null;
			throw error;
		});
	}
	return settingsPromise;
}

/**
 * Read the ordered RPC list for a chain from canonical Raindex settings.
 *
 * The order is operational configuration: viem tries the first URL first and
 * falls through to the remaining URLs when a request fails.
 */
export function getRaindexRpcUrls(settingsYaml: string, chainId: number): string[] {
	const document = parseDocument(settingsYaml, { schema: 'failsafe' });
	if (document.errors.length > 0) {
		throw new Error(`Registry settings YAML is invalid: ${document.errors[0].message}`);
	}

	const networks = document.get('networks', true);
	if (!isMap(networks)) {
		throw new Error('Registry settings do not contain a networks map');
	}

	const network = networks.items
		.map((pair) => pair.value)
		.find((value) => isMap(value) && String(value.get('chain-id')).trim() === String(chainId));
	if (!isMap(network)) {
		throw new Error(`Registry settings do not contain chain ${chainId}`);
	}

	const rpcs = network.get('rpcs', true);
	if (!isSeq(rpcs) || rpcs.items.length === 0) {
		throw new Error(`Registry settings do not contain RPC URLs for chain ${chainId}`);
	}

	return rpcs.items.map((item) => {
		if (!isScalar(item) || typeof item.value !== 'string') {
			throw new Error(`Registry settings contain a non-string RPC URL for chain ${chainId}`);
		}

		const value = item.value.trim();
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			throw new Error(`Registry settings contain an invalid RPC URL for chain ${chainId}`);
		}
		if (url.protocol !== 'https:' && url.protocol !== 'http:') {
			throw new Error(`Registry settings contain an unsupported RPC URL for chain ${chainId}`);
		}
		return value;
	});
}

/** Load the active registry once and return its ordered RPC list for a chain. */
export async function getBrowserRaindexRpcUrls(chainId: number): Promise<string[]> {
	return getRaindexRpcUrls(await getBrowserRaindexSettings(), chainId);
}
