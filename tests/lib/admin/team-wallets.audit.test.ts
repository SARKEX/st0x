// Runtime audit-log fan-out test for src/routes/api/admin/team-wallets/+server.ts.
// Mirrors excluded-wallets.audit.test.ts; EVENT_TYPE pair = TEAM_WALLET_ADDED/REMOVED.

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

import { POST } from '../../../src/routes/api/admin/team-wallets/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import { walletListPost } from '$lib/server/adminWalletList';

describe('admin/team-wallets audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('logs success on add → TEAM_WALLET_ADDED', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ success: true, wallets: ['0xteam'] }),
			action: 'add',
			address: '0xteam',
			success: true
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/team-wallets',
			body: JSON.stringify({ action: 'add', address: '0xteam' })
		});
		await POST(event);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'TEAM_WALLET_ADDED',
			expect.objectContaining({ walletAddress: '0xteam', label: 'team wallets' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logFailure).not.toHaveBeenCalled();
	});

	it('logs success on remove → TEAM_WALLET_REMOVED', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ success: true, wallets: [] }),
			action: 'remove',
			address: '0xteam',
			success: true
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/team-wallets',
			body: JSON.stringify({ action: 'remove', address: '0xteam' })
		});
		await POST(event);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'TEAM_WALLET_REMOVED',
			expect.objectContaining({ walletAddress: '0xteam' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
	});

	it('logs failure on add-duplicate', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ error: 'duplicate' }, { status: 400 }),
			action: 'add',
			address: '0xteam',
			success: false,
			errorMessage: 'duplicate'
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/team-wallets',
			body: JSON.stringify({ action: 'add', address: '0xteam' })
		});
		await POST(event);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logFailure).toHaveBeenCalledWith(
			'TEAM_WALLET_ADDED',
			expect.objectContaining({ walletAddress: '0xteam', label: 'team wallets' }),
			'duplicate',
			expect.objectContaining({ adminUser: 'admin' })
		);
	});

	it('does NOT emit audit when no action recognised', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ error: 'Invalid Ethereum address' }, { status: 400 }),
			address: '0xteam',
			success: false,
			errorMessage: 'invalid address'
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/team-wallets',
			body: JSON.stringify({ action: 'add', address: 'bad' })
		});
		await POST(event);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).not.toHaveBeenCalled();
		expect(logger.logFailure).not.toHaveBeenCalled();
	});
});
