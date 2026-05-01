// Runtime audit-log fan-out test for src/routes/api/admin/excluded-wallets/+server.ts.
// Per Plan 04-06 / D-03: catches behavioral regressions where a future refactor
// silently swallows audit emission. Pitfall 4 (mock leakage): vi.mock at top-of-file
// scope with beforeEach(vi.clearAllMocks()).

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

import { POST } from '../../../src/routes/api/admin/excluded-wallets/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import { walletListPost } from '$lib/server/adminWalletList';

describe('admin/excluded-wallets audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('logs success when an add succeeds', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ success: true, wallets: ['0xabc'] }),
			action: 'add',
			address: '0xabc',
			success: true
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/excluded-wallets',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'add', address: '0xabc' })
		});
		await POST(event);

		expect(createAuditLogger).toHaveBeenCalledWith(event.request);
		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'EXCLUDED_WALLET_ADDED',
			expect.objectContaining({ walletAddress: '0xabc', label: 'excluded wallets' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logFailure).not.toHaveBeenCalled();
	});

	it('logs success when a remove succeeds (event-type maps to REMOVED)', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ success: true, wallets: [] }),
			action: 'remove',
			address: '0xabc',
			success: true
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/excluded-wallets',
			body: JSON.stringify({ action: 'remove', address: '0xabc' })
		});
		await POST(event);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).toHaveBeenCalledWith(
			'EXCLUDED_WALLET_REMOVED',
			expect.objectContaining({ walletAddress: '0xabc' }),
			expect.objectContaining({ adminUser: 'admin' })
		);
	});

	it('logs failure with errorMessage when an add fails (e.g., duplicate)', async () => {
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ error: 'duplicate' }, { status: 400 }),
			action: 'add',
			address: '0xabc',
			success: false,
			errorMessage: 'duplicate'
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/excluded-wallets',
			body: JSON.stringify({ action: 'add', address: '0xabc' })
		});
		await POST(event);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logFailure).toHaveBeenCalledWith(
			'EXCLUDED_WALLET_ADDED',
			expect.objectContaining({ walletAddress: '0xabc', label: 'excluded wallets' }),
			'duplicate',
			expect.objectContaining({ adminUser: 'admin' })
		);
		expect(logger.logSuccess).not.toHaveBeenCalled();
	});

	it('does NOT emit audit when there is no recognised add/remove action (pre-action rejection)', async () => {
		// e.g., missing address — no `action` returned from helper
		(walletListPost as Mock).mockResolvedValueOnce({
			response: json({ error: 'Wallet address required' }, { status: 400 }),
			success: false,
			errorMessage: 'missing address'
		});

		const event = createMockRequestEvent({
			method: 'POST',
			url: 'http://localhost/api/admin/excluded-wallets',
			body: JSON.stringify({})
		});
		await POST(event);

		const logger = (createAuditLogger as Mock).mock.results[0].value;
		expect(logger.logSuccess).not.toHaveBeenCalled();
		expect(logger.logFailure).not.toHaveBeenCalled();
	});
});
