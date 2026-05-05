// Runtime audit-log fan-out test for
// src/routes/api/admin/referral-programme/migrate/+server.ts.

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

vi.mock('$lib/server/referrals', () => ({
	createReferralProfileForMigration: vi.fn()
}));

import { POST } from '../../../src/routes/api/admin/referral-programme/migrate/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import { createReferralProfileForMigration } from '$lib/server/referrals';

function makeEvent(body: unknown) {
	return createMockRequestEvent({
		method: 'POST',
		url: 'http://localhost/api/admin/referral-programme/migrate',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

const VALID_BODY = {
	walletAddress: '0xabc',
	referralCode: 'REF1',
	nickname: 'alice',
	telegramHandle: '@alice',
	migrateFromAccessCode: 'OLD'
};

describe('admin/referral-programme/migrate audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('logs REFERRAL_MIGRATION on success', async () => {
		(createReferralProfileForMigration as Mock).mockResolvedValue({
			success: true,
			profile: { walletAddress: '0xabc', referralCode: 'REF1' },
			migratedWallets: 3
		});

		const event = makeEvent(VALID_BODY);
		await POST(event as Parameters<typeof POST>[0]);

		expect(createAuditLogger).toHaveBeenCalledWith(event.request);
		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'REFERRAL_MIGRATION',
			expect.objectContaining({
				walletAddress: '0xabc',
				referralCode: 'REF1',
				nickname: 'alice',
				migrateFromAccessCode: 'OLD',
				profile: expect.any(Object),
				migratedWallets: 3
			})
		);
		expect(logger.logFailure).not.toHaveBeenCalled();
	});

	it('logs REFERRAL_MIGRATION_FAILED when underlying op returns success:false', async () => {
		(createReferralProfileForMigration as Mock).mockResolvedValue({
			success: false,
			error: 'duplicate referral code'
		});

		const event = makeEvent(VALID_BODY);
		await POST(event as Parameters<typeof POST>[0]);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logFailure).toHaveBeenCalledWith(
			'REFERRAL_MIGRATION_FAILED',
			expect.objectContaining({
				walletAddress: '0xabc',
				referralCode: 'REF1',
				nickname: 'alice',
				migrateFromAccessCode: 'OLD'
			}),
			'duplicate referral code'
		);
		expect(logger.logSuccess).not.toHaveBeenCalled();
	});
});
