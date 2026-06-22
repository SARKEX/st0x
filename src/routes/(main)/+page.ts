import type { Config } from '@sveltejs/adapter-vercel';

// SEO resilience (fixes the indexed homepage 500): serve the homepage shell
// from Vercel's ISR edge cache so crawlers — and users — get a cached 200 even
// when a later function invocation has a transient failure (cold-start timeout,
// KV/dependency blip). Previously the homepage was SSR'd on every request with
// no caching, so a single bad moment got served as a 500 and indexed by Google.
//
// Safe to cache: the SSR output here is auth-agnostic — all wallet/account state
// loads client-side via TanStack Query — so a shared cached copy leaks nothing
// per-visitor (see the adapter-vercel ISR note). Unlike a raw `prerender`, ISR
// still runs hooks.server.ts on (re)generation, so the CSP/HSTS/X-Frame security
// headers are captured in the cached response rather than stripped.
//
// Scoped to the index route only (NOT (main)/+layout) so auth-gated routes like
// /dashboard, /earn and /trade keep rendering per-request.
export const config: Config = {
	isr: {
		// Re-generate at most every 10 min; deploys invalidate the cache anyway.
		expiration: 600
	}
};
