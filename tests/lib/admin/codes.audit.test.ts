// Runtime audit-log fan-out test for src/routes/api/admin/codes/+server.ts.
// Covers POST (create), DELETE, and PUT (update) — PATCH is a code-generation
// utility with no audit emission and is intentionally not asserted here.

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

vi.mock('$lib/server/accessCodes', () => ({
	createAccessCode: vi.fn(),
	listAccessCodes: vi.fn(),
	deleteAccessCode: vi.fn(),
	getAccessCode: vi.fn(),
	getWalletsByCode: vi.fn(),
	generateAccessCode: vi.fn(),
	updateAccessCode: vi.fn()
}));

import { POST, DELETE, PUT } from '../../../src/routes/api/admin/codes/+server';
import { createAuditLogger } from '$lib/server/auditLog';
import {
	createAccessCode,
	getAccessCode,
	deleteAccessCode,
	updateAccessCode
} from '$lib/server/accessCodes';

function makeEvent(method: string, body: unknown) {
	return createMockRequestEvent({
		method,
		url: 'http://localhost/api/admin/codes',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
}

describe('admin/codes audit-log fan-out', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('POST (create)', () => {
		it('logs ACCESS_CODE_CREATED on success', async () => {
			(getAccessCode as Mock).mockResolvedValue(null);
			(createAccessCode as Mock).mockResolvedValue({
				code: 'ABC123',
				maxUses: 10,
				expiresAt: null,
				label: 'test'
			});

			const event = makeEvent('POST', {
				code: 'ABC123',
				maxUses: 10,
				label: 'test'
			});
			await POST(event as Parameters<typeof POST>[0]);

			expect(createAuditLogger).toHaveBeenCalledWith(event.request);
			const logger = (createAuditLogger as Mock).mock.results[0].value;
			expect(logger.logSuccess).toHaveBeenCalledWith(
				'ACCESS_CODE_CREATED',
				expect.objectContaining({
					code: 'ABC123',
					maxUses: 10,
					label: 'test'
				}),
				expect.objectContaining({ adminUser: 'admin' })
			);
		});

		it('does NOT emit audit when validation throws (existing-code branch returns early without audit)', async () => {
			(getAccessCode as Mock).mockResolvedValue({ code: 'DUP' });

			const event = makeEvent('POST', { code: 'DUP', maxUses: 10 });
			await POST(event as Parameters<typeof POST>[0]);

			const logger = (createAuditLogger as Mock).mock.results[0].value;
			expect(logger.logSuccess).not.toHaveBeenCalled();
			// codes/+server.ts does not currently emit logFailure for the
			// pre-create rejection paths — this test pins that behavior.
			expect(logger.logFailure).not.toHaveBeenCalled();
		});

		it('does NOT emit audit when underlying create throws (caught by handler, returns 400)', async () => {
			(getAccessCode as Mock).mockResolvedValue(null);
			(createAccessCode as Mock).mockRejectedValue(new Error('db down'));

			const event = makeEvent('POST', { code: 'X', maxUses: 1 });
			await POST(event as Parameters<typeof POST>[0]);

			const logger = (createAuditLogger as Mock).mock.results[0].value;
			// codes POST swallows errors and returns 400 with no logFailure call.
			// Pinning current behavior: a future regression that adds logFailure
			// would update this test deliberately.
			expect(logger.logSuccess).not.toHaveBeenCalled();
			expect(logger.logFailure).not.toHaveBeenCalled();
		});
	});

	describe('DELETE', () => {
		it('logs ACCESS_CODE_DELETED on successful delete', async () => {
			(deleteAccessCode as Mock).mockResolvedValue(true);

			const event = makeEvent('DELETE', { code: 'abc123' });
			await DELETE(event as Parameters<typeof DELETE>[0]);

			const logger = (createAuditLogger as Mock).mock.results[0].value;
			expect(logger.logSuccess).toHaveBeenCalledWith(
				'ACCESS_CODE_DELETED',
				expect.objectContaining({ code: 'ABC123' }), // uppercased
				expect.objectContaining({ adminUser: 'admin' })
			);
		});

		it('does NOT emit success when code not found (deleteAccessCode returns false → 404)', async () => {
			(deleteAccessCode as Mock).mockResolvedValue(false);

			const event = makeEvent('DELETE', { code: 'NONE' });
			await DELETE(event as Parameters<typeof DELETE>[0]);

			const logger = (createAuditLogger as Mock).mock.results[0].value;
			expect(logger.logSuccess).not.toHaveBeenCalled();
			expect(logger.logFailure).not.toHaveBeenCalled();
		});
	});

	describe('PUT (update)', () => {
		it('logs ACCESS_CODE_UPDATED on success', async () => {
			(getAccessCode as Mock).mockResolvedValue({ code: 'ABC123' });
			(updateAccessCode as Mock).mockResolvedValue({ code: 'ABC123', maxUses: 5 });

			const event = makeEvent('PUT', {
				code: 'ABC123',
				maxUses: 5,
				expiresAt: null,
				label: 'updated'
			});
			await PUT(event as Parameters<typeof PUT>[0]);

			const logger = (createAuditLogger as Mock).mock.results[0].value;
			expect(logger.logSuccess).toHaveBeenCalledWith(
				'ACCESS_CODE_UPDATED',
				expect.objectContaining({
					code: 'ABC123',
					changes: expect.objectContaining({ maxUses: 5, label: 'updated' })
				}),
				expect.objectContaining({ adminUser: 'admin' })
			);
		});

		it('does NOT emit success when update returns null (returns 500 without audit)', async () => {
			(getAccessCode as Mock).mockResolvedValue({ code: 'ABC123' });
			(updateAccessCode as Mock).mockResolvedValue(null);

			const event = makeEvent('PUT', { code: 'ABC123', maxUses: 5 });
			await PUT(event as Parameters<typeof PUT>[0]);

			const logger = (createAuditLogger as Mock).mock.results[0].value;
			expect(logger.logSuccess).not.toHaveBeenCalled();
			expect(logger.logFailure).not.toHaveBeenCalled();
		});
	});
});
