import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { isMap, parseDocument } from 'yaml';

const REGISTRY_MANIFEST_URL = publicEnv.PUBLIC_REGISTRY_URL || '/registry/manifest';

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

function settingsUrlFromManifest(manifest: string, manifestUrl: string): string {
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

async function fetchText(url: string, label: string): Promise<string> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to load ${label} (${response.status})`);
	}
	return response.text();
}

async function fetchBrowserRaindexSettings(): Promise<string> {
	const manifestUrl = resolveRegistryManifestUrl();
	const manifest = await fetchText(manifestUrl, 'registry manifest');
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
