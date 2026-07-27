import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const componentSources = [
	{
		name: 'MarketOrder',
		source: readFileSync(
			resolve(process.cwd(), 'src/lib/components/orders/MarketOrder.svelte'),
			'utf8'
		)
	},
	{
		name: 'QuickTrade',
		source: readFileSync(resolve(process.cwd(), 'src/lib/components/QuickTrade.svelte'), 'utf8')
	}
];

describe.each(componentSources)('$name REST quote query initialization', ({ source }) => {
	it('initializes the query store before its reactive replacement', () => {
		const initialQueryIndex = source.indexOf(
			'let marketQuoteQuery = createQuery<ApiSwapQuoteV2Response>'
		);
		const reactiveQueryIndex = source.indexOf(
			'$: marketQuoteQuery = createQuery<ApiSwapQuoteV2Response>'
		);

		expect(initialQueryIndex).toBeGreaterThan(-1);
		expect(reactiveQueryIndex).toBeGreaterThan(initialQueryIndex);
		expect(source.slice(initialQueryIndex, reactiveQueryIndex)).toContain('enabled: false');
	});

	it('guards the first query result read during component initialization', () => {
		expect(source).toContain('$marketQuoteQuery?.data');
		expect(source).not.toContain('$marketQuoteQuery.data');
	});
});
