/**
 * Public order-strategy registry manifest.
 *
 * The REST API stores the source commit that produced its active private
 * registry artifact. We use that commit only as an immutable public pointer:
 * the private artifact itself (including private RPC URLs) never leaves the
 * API. The browser SDK then loads the public manifest and strategy sources
 * from the matching st0x.registry commit.
 */
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const REGISTRY_REPOSITORY_RAW_URL =
	'https://raw.githubusercontent.com/ST0x-Technology/st0x.registry';
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const STALE_REGISTRY_PIN_PATTERN =
	/https:\/\/raw\.githubusercontent\.com\/ST0x-Technology\/st0x\.registry\/[0-9a-f]{40}\//gi;

type RegistryMetadata = {
	registry_type: 'private_artifact' | 'public_url';
	source_commit: string | null;
};

function apiBaseUrl(): string {
	const url = env.ST0X_API_URL;
	if (!url) throw new Error('ST0X_API_URL is not configured');
	return url.replace(/\/+$/, '');
}

function apiAuthorization(): string {
	const key = env.ST0X_API_KEY;
	const secret = env.ST0X_API_SECRET;
	if (!key || !secret) throw new Error('ST0X_API_KEY and ST0X_API_SECRET are not configured');
	return `Basic ${btoa(`${key}:${secret}`)}`;
}

function registryUrlForCommit(commit: string): string {
	if (!COMMIT_SHA_PATTERN.test(commit)) {
		throw new Error('REST API returned an invalid registry source commit');
	}
	return `${REGISTRY_REPOSITORY_RAW_URL}/${commit}/registry`;
}

/**
 * The `registry` index file pins each asset to a commit SHA captured when that
 * file was authored. Squash-merges leave those SHAs off `main`, and GitHub's
 * raw CDN then 400s them even though the GitHub API still has the blobs.
 * Rewrite every pin to the REST API source commit — the immutable public
 * pointer this endpoint already uses to fetch the index.
 */
function rewriteRegistryPinsToSourceCommit(manifest: string, sourceCommit: string): string {
	return manifest.replace(
		STALE_REGISTRY_PIN_PATTERN,
		`${REGISTRY_REPOSITORY_RAW_URL}/${sourceCommit}/`
	);
}

export const GET: RequestHandler = async ({ fetch }) => {
	let metadataResponse: Response;
	try {
		metadataResponse = await fetch(`${apiBaseUrl()}/registry`, {
			headers: {
				accept: 'application/json',
				authorization: apiAuthorization()
			},
			cache: 'no-store'
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[registry/manifest] failed to load REST API registry metadata:', message);
		return new Response('Registry metadata is unavailable', { status: 503 });
	}

	if (!metadataResponse.ok) {
		console.warn(
			`[registry/manifest] REST API registry metadata returned ${metadataResponse.status}`
		);
		return new Response('Registry metadata is unavailable', { status: 502 });
	}

	let metadata: RegistryMetadata;
	try {
		metadata = (await metadataResponse.json()) as RegistryMetadata;
	} catch {
		return new Response('Registry metadata is invalid', { status: 502 });
	}

	let sourceCommit: string;
	let registryUrl: string;
	try {
		if (!metadata.source_commit) {
			throw new Error('REST API registry metadata has no source commit');
		}
		sourceCommit = metadata.source_commit;
		registryUrl = registryUrlForCommit(sourceCommit);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[registry/manifest] invalid REST API registry metadata:', message);
		return new Response('Registry metadata is invalid', { status: 502 });
	}

	let registryResponse: Response;
	try {
		registryResponse = await fetch(registryUrl, { cache: 'no-store' });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn('[registry/manifest] failed to load public registry:', message);
		return new Response('Public registry is unavailable', { status: 502 });
	}

	if (!registryResponse.ok) {
		console.warn(`[registry/manifest] public registry returned ${registryResponse.status}`);
		return new Response('Public registry is unavailable', { status: 502 });
	}

	const manifest = rewriteRegistryPinsToSourceCommit(await registryResponse.text(), sourceCommit);

	return new Response(manifest, {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=300',
			'x-registry-source-commit': sourceCommit
		}
	});
};
