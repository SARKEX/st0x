/**
 * Server-side OBS-09 Plan 02-01 Task 3 — pino RequestContext extension with trade_id.
 *
 * Tests the requestContextHandle middleware:
 *  - Test 1: Valid X-Trade-Id (UUIDv4) → child logger gets trade_id field
 *  - Test 2: Missing header → child logger does NOT include trade_id
 *  - Test 3: Invalid X-Trade-Id (not UUIDv4 shape) → trade_id absent (T-2-A)
 *  - Test 4: Header lookup case-insensitive (Headers.get is normalized)
 *  - Test 5: trade_id and request_id coexist (orthogonal fields)
 *
 * The mock for `./walletSession.readSession` is required because requestContextHandle
 * may try to read a session record; we no-op it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/walletSession', () => ({
	readSession: vi.fn().mockResolvedValue(null)
}));

import baseLogger, { requestContextHandle, getLogger, getRequestContext } from '$lib/server/logger';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function makeEvent(headers: Record<string, string> = {}, path = '/api/test', method = 'GET') {
	return {
		request: {
			headers: new Headers(headers),
			method
		},
		cookies: { get: () => undefined },
		url: new URL(`http://localhost${path}`)
	} as unknown as Parameters<typeof requestContextHandle>[0]['event'];
}

describe('requestContextHandle — trade_id extraction (Task 3)', () => {
	let childSpy: ReturnType<typeof vi.spyOn>;
	let capturedChildBindings: Record<string, unknown>[] = [];

	beforeEach(() => {
		capturedChildBindings = [];
		childSpy = vi.spyOn(baseLogger, 'child').mockImplementation((bindings) => {
			capturedChildBindings.push(bindings as Record<string, unknown>);
			return baseLogger; // return self so further .info() calls don't crash
		});
	});

	async function runHandle(headers: Record<string, string>) {
		const event = makeEvent(headers);
		let observedCtx: ReturnType<typeof getRequestContext>;
		await requestContextHandle({
			event,
			resolve: async () => {
				observedCtx = getRequestContext();
				// Call getLogger() to trigger child() with trade_id binding.
				getLogger();
				return new Response(null, { status: 200 });
			}
		} as unknown as Parameters<typeof requestContextHandle>[0]);
		return observedCtx;
	}

	it('Test 1: valid X-Trade-Id (UUIDv4) → child logger gets trade_id field', async () => {
		const ctx = await runHandle({ 'x-trade-id': VALID_UUID });
		expect(ctx?.trade_id).toBe(VALID_UUID);
		// At least one child() call should include trade_id
		const callsWithTradeId = capturedChildBindings.filter((b) => b.trade_id === VALID_UUID);
		expect(callsWithTradeId.length).toBeGreaterThan(0);
	});

	it('Test 2: missing header → child logger does NOT include trade_id', async () => {
		const ctx = await runHandle({});
		expect(ctx?.trade_id).toBeNull();
		// No child() call should contain a trade_id key
		for (const bindings of capturedChildBindings) {
			expect(bindings).not.toHaveProperty('trade_id');
		}
	});

	it('Test 3: invalid X-Trade-Id shape → trade_id absent (T-2-A header injection)', async () => {
		const invalids = [
			'not-a-uuid',
			"'; DROP TABLE--",
			'<script>alert(1)</script>',
			'a'.repeat(1000),
			'550e8400-e29b-41d4-a716-44665544000', // too short
			'550e8400-e29b-31d4-a716-446655440000', // version 3, not 4
			'550e8400\ne29b-41d4-a716-446655440000' // newline injection
		];
		for (const bad of invalids) {
			capturedChildBindings = [];
			const ctx = await runHandle({ 'x-trade-id': bad });
			expect(ctx?.trade_id, `bad value: ${bad}`).toBeNull();
			for (const bindings of capturedChildBindings) {
				expect(bindings).not.toHaveProperty('trade_id');
			}
		}
	});

	it('Test 4: header lookup is case-insensitive (Headers.get normalizes)', async () => {
		// Headers normalizes to lowercase internally, so passing "X-Trade-Id" must work
		const ctx = await runHandle({ 'X-Trade-Id': VALID_UUID });
		expect(ctx?.trade_id).toBe(VALID_UUID);
	});

	it('Test 5: trade_id + request_id coexist (orthogonal)', async () => {
		const ctx = await runHandle({ 'x-trade-id': VALID_UUID, 'x-request-id': 'req-xyz' });
		expect(ctx?.trade_id).toBe(VALID_UUID);
		expect(ctx?.request_id).toBe('req-xyz');
		const both = capturedChildBindings.find(
			(b) => b.trade_id === VALID_UUID && b.request_id === 'req-xyz'
		);
		expect(both).toBeDefined();
	});
});
