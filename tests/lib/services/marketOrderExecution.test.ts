import { describe, expect, it } from 'vitest';
import type { ProcessedQuote } from '$lib/utils/orderbook';
import { excludeTakerOwnedQuotes } from '$lib/services/marketOrderExecution';

function quoteWithOwner(orderHash: string, owner?: string): ProcessedQuote {
	return {
		orderHash,
		maxOutput: '0x0',
		ratio: '0x0',
		inputTokenSymbol: 'USDC',
		outputTokenSymbol: 'wtSTOX',
		inputTokenAddress: '0x1111111111111111111111111111111111111111',
		outputTokenAddress: '0x2222222222222222222222222222222222222222',
		inputIOIndex: 0,
		outputIOIndex: 0,
		orderData: owner
			? ({
					owner,
					evaluable: {
						interpreter: '0x3333333333333333333333333333333333333333',
						store: '0x4444444444444444444444444444444444444444',
						bytecode: '0x'
					},
					validInputs: [],
					validOutputs: [],
					nonce: '0x0'
				} as unknown as ProcessedQuote['orderData'])
			: undefined
	};
}

describe('excludeTakerOwnedQuotes', () => {
	it('removes quotes owned by the taker address', () => {
		const taker = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa';
		const quotes: ProcessedQuote[] = [
			quoteWithOwner('0x-self', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
			quoteWithOwner('0x-external', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
		];

		const filtered = excludeTakerOwnedQuotes(quotes, taker);

		expect(filtered.map((q) => q.orderHash)).toEqual(['0x-external']);
	});
});
