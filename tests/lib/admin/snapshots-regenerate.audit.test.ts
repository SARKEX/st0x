// Runtime audit-log fan-out test for src/routes/api/admin/snapshots/regenerate/+server.ts.
// Drives POST happy + failure paths; mocks requireAdmin (allow), generator,
// kv, $env (BLOB token), and @vercel/blob put.

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
	generateAllTokenSnapshots: vi.fn()
}));

vi.mock('$lib/server/snapshots/scraper', () => ({
	TOKEN_ADDRESSES: ['0xtoken1', '0xtoken2']
}));

vi.mock('$lib/server/kv', () => ({
	kvGet: vi.fn(),
	KV_KEYS: {
		snapshotBlocks: () => 'kv:snapshotBlocks'
	}
}));

vi.mock('$env/dynamic/private', () => ({
	env: { BLOB_READ_WRITE_TOKEN: 'fake-token' }
}));

vi.mock('@vercel/blob', () => ({
	put: vi.fn(async (path: string) => ({ url: `https://blob/${path}` }))
}));

import { POST } from '../../../src/routes/api/admin/snapshots/regenerate/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import { generateAllTokenSnapshots } from '$lib/server/snapshots/generator';
import { kvGet } from '$lib/server/kv';

function makeEvent(body: unknown) {
	return createMockRequestEvent({
		method: 'POST',
		url: 'http://localhost/api/admin/snapshots/regenerate',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('admin/snapshots/regenerate audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		(kvGet as Mock).mockResolvedValue([
			{ blockNumber: 1234, date: '2024-01-15', timestamp: 1, generatedAt: '' }
		]);
		(generateAllTokenSnapshots as Mock).mockResolvedValue([{ tokenSymbol: 'tNVDA' }]);
	});

	it('logs SNAPSHOT_REGENERATED success on single-block regenerate', async () => {
		const event = makeEvent({ blockNumber: 1234 });
		await POST(event);

		expect(createAuditLogger).toHaveBeenCalledWith(event.request);
		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'SNAPSHOT_REGENERATED',
			expect.objectContaining({
				blockNumber: 1234,
				totalBlocks: 1,
				successful: 1,
				failed: 0,
				regeneratedAt: expect.any(String)
			}),
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logFailure).not.toHaveBeenCalled();
	});

	it('logs SNAPSHOT_REGENERATED failure when kvGet throws', async () => {
		(kvGet as Mock).mockRejectedValue(new Error('kv outage'));

		const event = makeEvent({ blockNumber: 1234 });
		const response = await POST(event);

		expect((response as Response).status).toBe(500);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logFailure).toHaveBeenCalledWith(
			'SNAPSHOT_REGENERATED',
			expect.objectContaining({
				blockNumber: 1234,
				regeneratedAt: expect.any(String)
			}),
			'kv outage',
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logSuccess).not.toHaveBeenCalled();
	});
});
