// Dynamic rain.strategies manifest. The other registry assets (settings.yaml +
// the 9 .rain strategy sources) are served as static files from
// static/registry/* — only the manifest itself needs to be generated per-request
// because DotrainRegistry.new (in @rainlanguage/orderbook) does NOT resolve
// relative URLs against the manifest URL. It requires ABSOLUTE URLs in the
// manifest body, then fetches each referenced file directly. With relative
// URLs the SDK throws "Invalid URL format: relative URL without a base."
//
// This endpoint derives absolute URLs from the inbound request's origin so
// the manifest works on any host (localhost, preview, staging, production) —
// preserving Plan 03-10/REL-03's "no external GitHub dependency" goal while
// being compatible with the SDK. The old static/registry/manifest file was
// removed because SvelteKit routes win over static files at the same path,
// but keeping it around would invite confusion about which one is live.
//
// Pinned-commit equivalence: this manifest lists the SAME 9 strategies that
// static/registry/ was vendored from (upstream commit 9dd64902 per Plan 03-10).
// Refreshing the registry means refreshing the static/registry/*.rain files
// AND the STRATEGIES list below — both should always reference the same
// upstream commit.
import type { RequestHandler } from './$types';

// Strategies vendored from rainlanguage/rain.strategies @ 9dd64902 — keep this
// list in sync with the .rain files under static/registry/. The SDK loads
// 'fixed-limit' for limit orders, 'auction-dca' for DCA, etc.; consumers in
// src/lib/services/orderDeployment.ts and friends use these keys.
const STRATEGIES = [
	'fixed-limit',
	'auction-dca',
	'grid',
	'dynamic-spread',
	'canary',
	'claims',
	'fixed-spread',
	'folio'
] as const;

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	const lines = [
		`${origin}/registry/settings.yaml`,
		...STRATEGIES.map((s) => `${s} ${origin}/registry/${s}.rain`)
	];
	return new Response(lines.join('\n') + '\n', {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			// Per-origin response; vary on Host so a CDN doesn't serve the wrong
			// origin's manifest to a different domain. Cache short — the manifest
			// rarely changes (refreshed only when the vendored registry rolls).
			'cache-control': 'public, max-age=300',
			vary: 'Host'
		}
	});
};
