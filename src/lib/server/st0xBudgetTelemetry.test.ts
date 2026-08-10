import { beforeEach, describe, expect, it, vi } from 'vitest';

const { info, warn } = vi.hoisted(() => ({
	info: vi.fn(),
	warn: vi.fn()
}));

vi.mock('$lib/server/logger', () => ({
	getLogger: () => ({ info, warn })
}));

import { logSt0xRequestBudget } from '$lib/server/st0xBudgetTelemetry';

describe('logSt0xRequestBudget', () => {
	beforeEach(() => {
		info.mockReset();
		warn.mockReset();
	});

	it('labels successful upstream budget telemetry by endpoint and credential', () => {
		logSt0xRequestBudget(
			'v1/orders/query',
			'prices',
			new Response(null, {
				status: 200,
				headers: {
					'X-RateLimit-Remaining': '59',
					'X-RateLimit-Reset': '123'
				}
			})
		);

		expect(info).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'st0x_request_budget',
				upstream_endpoint: 'v1/orders/query',
				credential_label: 'prices',
				remaining: '59'
			}),
			'st0x request budget'
		);
	});

	it('warns on 429 even when the upstream omits budget headers', () => {
		logSt0xRequestBudget('v1/trades/query', 'general', new Response(null, { status: 429 }));

		expect(warn).toHaveBeenCalledWith(
			expect.objectContaining({
				upstream_endpoint: 'v1/trades/query',
				credential_label: 'general',
				status: 429
			}),
			'st0x request budget exhausted'
		);
	});
});
