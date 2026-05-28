/**
 * CSP regression test (Plan 02-02 Task 1, Pitfall 3).
 *
 * Sentry Replay's compression worker requires `worker-src 'self' blob:` in CSP.
 * If a future CSP edit silently drops this directive, Replay degrades to no-op
 * without surfacing an error in production. This test is the regression guard:
 * it asserts the directive is present in the canonical CSP source.
 *
 * Per Plan 02-02 Task 1 (D-02 + Pitfall 3 + Threat T-2-G): the CSP string is
 * extracted into `src/lib/server/csp.ts` (vs. inline in hooks.server.ts) so it
 * can be unit-tested without triggering hooks.server.ts top-level side effects
 * ($env/dynamic/private, Sentry.init, etc.).
 */

import { describe, it, expect } from 'vitest';
import { CSP_DIRECTIVES, buildCspHeader } from '$lib/server/csp';

describe('CSP', () => {
	it("includes worker-src 'self' blob: (Sentry Replay regression guard, Pitfall 3)", () => {
		// Directive array form: at least one entry MUST be exactly "worker-src 'self' blob:"
		expect(CSP_DIRECTIVES).toContain("worker-src 'self' blob:");

		// Joined header form: substring assertion — a future refactor that flattens or
		// re-orders the directives must still preserve this substring.
		const header = buildCspHeader();
		expect(header).toContain("worker-src 'self' blob:");
	});
});
