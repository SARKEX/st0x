import { describe, expect, it } from 'vitest';
import { getPublishedDocSlugs } from '$lib/docs/processDocs';

describe('published documentation slugs', () => {
	it('derives every published route from the documentation sources', () => {
		expect(getPublishedDocSlugs()).toEqual([
			'architecture',
			'faqs',
			'how-to',
			'introduction',
			'liquidity-bridges',
			'programmatic-intents-system',
			'st0x-interface',
			'st0x-solvers',
			'tokenisation-layer'
		]);
	});
});
