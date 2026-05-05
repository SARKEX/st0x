// Runtime audit-log fan-out test for src/routes/api/admin/snapshots/trigger/+server.ts.
// Drives the full POST handler, mocking requireAdmin (allow), the snapshot
// generator helpers, @vercel/blob put, and kv. The audit emission is the SUT.

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

vi.mock('$lib/server/snapshots/generator', () => ({
	generateAllTokenSnapshots: vi.fn(),
	getBlockTimestamp: vi.fn(),
	getBlockNumberForTimestamp: vi.fn()
}));

vi.mock('$lib/server/kv', () => ({
	getKv: vi.fn(async () => null), // null → skip kv branch (still hits success)
	kvGet: vi.fn(async () => []),
	kvSet: vi.fn(async () => undefined),
	KV_KEYS: {
		snapshotBlocksByDate: (d: string) => `kv:snapshotBlocksByDate:${d}`,
		snapshotBlocks: () => 'kv:snapshotBlocks'
	}
}));

vi.mock('@vercel/blob', () => ({
	put: vi.fn(async (path: string) => ({ url: `https://blob/${path}` }))
}));

import { POST } from '../../../src/routes/api/admin/snapshots/trigger/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import {
	generateAllTokenSnapshots,
	getBlockTimestamp,
	getBlockNumberForTimestamp
} from '$lib/server/snapshots/generator';

const PAST_DATE = '2024-01-15';

function makeEvent(body: unknown) {
	return createMockRequestEvent({
		method: 'POST',
		url: 'http://localhost/api/admin/snapshots/trigger',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('admin/snapshots/trigger audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(getBlockNumberForTimestamp as Mock).mockResolvedValue(1000);
		(getBlockTimestamp as Mock).mockResolvedValue(1700000000);
		(generateAllTokenSnapshots as Mock).mockResolvedValue([
			{ tokenSymbol: 'tNVDA' },
			{ tokenSymbol: 'tAMZN' }
		]);
	});

	it('logs SNAPSHOT_TRIGGERED success on happy-path POST', async () => {
		const event = makeEvent({ date: PAST_DATE, confirmText: 'CONFIRM' });
		await POST(event as Parameters<typeof POST>[0]);

		expect(createAuditLogger).toHaveBeenCalledWith(event.request);
		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'SNAPSHOT_TRIGGERED',
			expect.objectContaining({
				date: PAST_DATE,
				blocks: expect.any(Array),
				blobsStored: expect.any(Number),
				triggeredAt: expect.any(String)
			}),
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logFailure).not.toHaveBeenCalled();
	});

	it('logs SNAPSHOT_TRIGGERED failure when generator throws', async () => {
		(generateAllTokenSnapshots as Mock).mockRejectedValue(new Error('generator boom'));

		const event = makeEvent({ date: PAST_DATE, confirmText: 'CONFIRM' });
		const response = await POST(event as Parameters<typeof POST>[0]);

		// Endpoint propagates a 500 (success: false response body)
		expect((response as Response).status).toBe(500);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logFailure).toHaveBeenCalledWith(
			'SNAPSHOT_TRIGGERED',
			expect.objectContaining({ date: PAST_DATE, triggeredAt: expect.any(String) }),
			'generator boom',
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logSuccess).not.toHaveBeenCalled();
	});
});
