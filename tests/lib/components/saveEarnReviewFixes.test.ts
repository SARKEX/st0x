import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function source(path: string): string {
	return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('Save & Earn review safeguards', () => {
	const modal = source('src/lib/components/earn/SaveEarnModal.svelte');

	it('uses a guarded REST quote for display and execution', () => {
		expect(modal).toContain('apiGetSwapQuoteV2');
		expect(modal).toContain('referenceIoRatio');
		expect(modal).toContain('marketQuote?.fullyFilled');
		expect(modal).toContain('network: saveEarnNetwork');
	});

	it('keeps query observers stable and restricts SGOV to its configured chain', () => {
		expect(modal).toContain('const marketQuoteQuery = createQuery');
		expect(modal).toContain('const usdcBalanceQuery = createQuery');
		expect(modal).toContain('const wtsgovBalanceQuery = createQuery');
		expect(modal).not.toMatch(/\$:\s+\w+Query\s*=\s*createQuery/);
		expect(modal).toContain('getNetworkByChainId(SGOV_CHAIN_ID)');
	});

	it('blocks closed-market submission in both the UI state and handler', () => {
		expect(modal).toContain('!marketClosed');
		expect(modal).toContain('if (isOutsideMarketHours())');
	});
});
