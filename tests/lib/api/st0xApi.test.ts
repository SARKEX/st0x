import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGetSwapCalldataV2, apiGetSwapQuoteV2 } from '$lib/api/st0xApi';

describe('st0x API client', () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it('posts v2 swap calldata requests through the authenticated proxy', async () => {
		const responseBody = {
			to: '0x0000000000000000000000000000000000000001',
			data: '0x1234',
			value: '0x0',
			estimatedInput: '100',
			denomination: 'wrapped' as const,
			resolvedPriceCap: '2.02',
			approvals: []
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await apiGetSwapCalldataV2({
			taker: '0x0000000000000000000000000000000000000002',
			inputToken: '0x0000000000000000000000000000000000000003',
			outputToken: '0x0000000000000000000000000000000000000004',
			mode: 'spendUpTo',
			amount: '100',
			slippageBps: 100
		});

		expect(result).toEqual(responseBody);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v2/swap/calldata',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					taker: '0x0000000000000000000000000000000000000002',
					inputToken: '0x0000000000000000000000000000000000000003',
					outputToken: '0x0000000000000000000000000000000000000004',
					mode: 'spendUpTo',
					amount: '100',
					slippageBps: 100
				})
			})
		);
	});

	it('posts mode-based quotes through the authenticated proxy', async () => {
		const responseBody = {
			inputToken: '0x0000000000000000000000000000000000000003',
			outputToken: '0x0000000000000000000000000000000000000004',
			mode: 'buyUpTo' as const,
			amount: '2',
			denomination: 'wrapped' as const,
			estimatedInput: '5',
			estimatedOutput: '2',
			estimatedIoRatio: '2.5',
			fullyFilled: true,
			resolvedPriceCap: '2.525'
		};
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify(responseBody), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		const request = {
			taker: '0x0000000000000000000000000000000000000002',
			inputToken: responseBody.inputToken,
			outputToken: responseBody.outputToken,
			mode: 'buyUpTo' as const,
			amount: '2',
			slippageBps: 100,
			referenceIoRatio: '2.5'
		};
		const result = await apiGetSwapQuoteV2(request);

		expect(result).toEqual(responseBody);
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/st0x/v2/swap/quote',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify(request)
			})
		);
	});
});
