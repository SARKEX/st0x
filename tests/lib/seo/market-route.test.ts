import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/sveltekit', () => ({
	wrapLoadWithSentry: <T>(loadFunction: T) => loadFunction
}));

import { load } from '../../../src/routes/(main)/markets/[symbol]/+page';

describe('market SEO route canonicalization', () => {
	it('loads the canonical lowercase market route', () => {
		const data = load({ params: { symbol: 'nvda' } } as Parameters<typeof load>[0]);

		expect(data.asset.slug).toBe('nvda');
	});

	it('permanently redirects mixed-case aliases to the canonical slug', () => {
		try {
			load({ params: { symbol: 'NVDA' } } as Parameters<typeof load>[0]);
			expect.unreachable('expected a canonical redirect');
		} catch (error) {
			expect(error).toMatchObject({ status: 308, location: '/markets/nvda' });
		}
	});

	it('returns a 404 for unknown markets', () => {
		try {
			load({ params: { symbol: 'not-a-market' } } as Parameters<typeof load>[0]);
			expect.unreachable('expected a 404');
		} catch (error) {
			expect(error).toMatchObject({ status: 404 });
		}
	});
});
