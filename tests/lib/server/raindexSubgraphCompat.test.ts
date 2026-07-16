import { describe, expect, it } from 'vitest';
import {
	rewriteOrderbookResponseToModern,
	rewriteRaindexQueryToLegacy
} from '$lib/server/raindexSubgraphCompat';

describe('raindexSubgraphCompat rewrites', () => {
	it('rewrites modern GraphQL field/type names to legacy orderbook schema', () => {
		const query = `{
      orders {
        raindex { id }
      }
      Raindex(id: "0x1") { id }
    }`;
		const legacy = rewriteRaindexQueryToLegacy(query);
		expect(legacy).toContain('orderbook { id }');
		expect(legacy).toContain('Orderbook(id:');
		expect(legacy).not.toMatch(/\braindex\b/);
		expect(legacy).not.toMatch(/\bRaindex\b/);
	});

	it('rewrites legacy JSON keys and __typename without touching string values', () => {
		const legacy = JSON.stringify({
			data: {
				orders: [
					{
						__typename: 'Order',
						orderHash: '0xabc',
						orderbook: { __typename: 'Orderbook', id: '0xe522' },
						meta: 'orderbook-should-stay-literal'
					}
				]
			}
		});
		const modern = JSON.parse(rewriteOrderbookResponseToModern(legacy));
		expect(modern.data.orders[0].raindex).toEqual({ __typename: 'Raindex', id: '0xe522' });
		expect(modern.data.orders[0].orderbook).toBeUndefined();
		expect(modern.data.orders[0].meta).toBe('orderbook-should-stay-literal');
	});
});
