// Runtime audit-log fan-out test for
// src/routes/api/admin/referral-programme/refresh/+server.ts.

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { createMockRequestEvent } from '../../hooks/_helpers';

vi.mock('$lib/server/auditLog', () => ({
	createAuditLogger: vi.fn(() => ({
		log: vi.fn(),
		logSuccess: vi.fn(),
		logFailure: vi.fn()
	}))
}));

vi.mock('$lib/server/adminAuth', () => ({
	requireAdmin: vi.fn(async () => null)
}));

vi.mock('$lib/server/cache', () => ({
	cacheDelete: vi.fn(async () => undefined),
	CACHE_KEYS: {
		referralPublicLeaderboard: () => 'cache:referral:public-leaderboard',
		referralAdminLeaderboard: (m: string) => `cache:referral:admin-leaderboard:${m}`
	}
}));

import { POST } from '../../../src/routes/api/admin/referral-programme/refresh/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import { cacheDelete } from '$lib/server/cache';

function makeEvent(opts: { url?: string } = {}) {
	return createMockRequestEvent({
		method: 'POST',
		url: opts.url ?? 'http://localhost/api/admin/referral-programme/refresh'
	});
}

describe('admin/referral-programme/refresh audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('logs REFERRAL_CACHE_REFRESH on happy-path POST (no month → "all")', async () => {
		const event = makeEvent();
		await POST(event as Parameters<typeof POST>[0]);

		expect(createAuditLogger).toHaveBeenCalledWith(event.request);
		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'REFERRAL_CACHE_REFRESH',
			expect.objectContaining({ month: 'all' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logFailure).not.toHaveBeenCalled();
	});

	it('logs REFERRAL_CACHE_REFRESH with explicit month when ?month=YYYY-MM', async () => {
		const event = makeEvent({
			url: 'http://localhost/api/admin/referral-programme/refresh?month=2024-03'
		});
		await POST(event as Parameters<typeof POST>[0]);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'REFERRAL_CACHE_REFRESH',
			expect.objectContaining({ month: '2024-03' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
	});

	it('logs REFERRAL_CACHE_REFRESH failure when cacheDelete throws', async () => {
		(cacheDelete as Mock).mockRejectedValueOnce(new Error('cache outage'));

		const event = makeEvent();
		const response = await POST(event as Parameters<typeof POST>[0]);
		expect((response as Response).status).toBe(500);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).not.toHaveBeenCalled();
		expect(logger.logFailure).toHaveBeenCalledWith(
			'REFERRAL_CACHE_REFRESH',
			expect.objectContaining({ month: 'all' }),
			'cache outage',
			expect.objectContaining({ adminUser: 'admin' })
		);
	});
});
