// Runtime audit-log fan-out test for src/routes/api/admin/pool-wallets/+server.ts.
// Mirrors excluded-wallets.audit.test.ts (same helper-returns-outcome pattern,
// different EVENT_TYPE pair + label).

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest';
import { json } from '@sveltejs/kit';
import { createMockRequestEvent } from '../../hooks/_helpers';

vi.mock('$lib/server/auditLog', () => ({
	createAuditLogger: vi.fn(() => ({
		log: vi.fn(),
		logSuccess: vi.fn(),
		logFailure: vi.fn()
	}))
}));

vi.mock('$lib/server/adminWalletList', () => ({
	walletListGet: vi.fn(),
	walletListPost: vi.fn()
}));

import { POST } from '../../../src/routes/api/admin/pool-wallets/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import { walletListPost } from '$lib/server/adminWalletList';

describe('admin/pool-wallets audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('logs success on add → POOL_WALLET_ADDED', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ success: true, wallets: ['0xpool'] }),
			action: 'add',
			address: '0xpool',
			success: true
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/pool-wallets',
			body: JSON.stringify({ action: 'add', address: '0xpool' })
		});
		await POST(event as Parameters<typeof POST>[0]);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'POOL_WALLET_ADDED',
			expect.objectContaining({ walletAddress: '0xpool', label: 'pool wallets' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logFailure).not.toHaveBeenCalled();
	});

	it('logs success on remove → POOL_WALLET_REMOVED', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ success: true, wallets: [] }),
			action: 'remove',
			address: '0xpool',
			success: true
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/pool-wallets',
			body: JSON.stringify({ action: 'remove', address: '0xpool' })
		});
		await POST(event as Parameters<typeof POST>[0]);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'POOL_WALLET_REMOVED',
			expect.objectContaining({ walletAddress: '0xpool' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
	});

	it('logs failure on remove-not-found', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ error: 'not found' }, { status: 404 }),
			action: 'remove',
			address: '0xpool',
			success: false,
			errorMessage: 'not found'
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/pool-wallets',
			body: JSON.stringify({ action: 'remove', address: '0xpool' })
		});
		await POST(event as Parameters<typeof POST>[0]);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logFailure).toHaveBeenCalledWith(
			'POOL_WALLET_REMOVED',
			expect.objectContaining({ walletAddress: '0xpool', label: 'pool wallets' }),
			'not found',
			expect.objectContaining({ adminUser: 'admin' })
		);
	});

	it('does NOT emit audit when no action recognised (e.g., invalid action)', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ error: 'Invalid action' }, { status: 400 }),
			address: '0xpool',
			success: false,
			errorMessage: 'invalid action'
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/pool-wallets',
			body: JSON.stringify({ action: 'foo', address: '0xpool' })
		});
		await POST(event as Parameters<typeof POST>[0]);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).not.toHaveBeenCalled();
		expect(logger.logFailure).not.toHaveBeenCalled();
	});
});
