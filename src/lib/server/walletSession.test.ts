import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// SEC-03 walletSession lifecycle tests — KV-backed session record with
// 30-day TTL and 24h sliding-refresh threshold (CONTEXT D-04a; RESEARCH A2).
// Mirrors the vi.hoisted + vi.mock('./kv') boilerplate used in
// signatureChallenge.test.ts so the same KV mock contract is preserved.

const { mockGetKv } = vi.hoisted(() => ({
	mockGetKv: vi.fn()
}));

vi.mock('./kv', () => ({
	getKv: mockGetKv
}));

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

describe('walletSession (SEC-03)', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NODE_ENV = 'test';
	});

	afterAll(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	it('createSession round-trip: returns 64-hex sessionId; readSession returns lowercased wallet record', async () => {
		const store = new Map<string, string>();
		const kvSet = vi.fn(async (key: string, value: string, _opts?: { PX: number }) => {
			store.set(key, value);
		});
		const kvGet = vi.fn(async (key: string) => store.get(key) ?? null);
		mockGetKv.mockResolvedValue({ set: kvSet, get: kvGet, del: vi.fn() });

		const { createSession, readSession } = await import('./walletSession');

		const before = Date.now();
		const { sessionId, expiresAt } = await createSession(
			'0xABCdef0123456789012345678901234567890123'
		);
		const after = Date.now();

		expect(sessionId).toMatch(/^[a-f0-9]{64}$/);
		expect(expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
		expect(expiresAt).toBeLessThanOrEqual(after + SESSION_TTL_MS + 5);

		// Verify kv.set was called with PX (TTL in ms) = 30 days
		expect(kvSet).toHaveBeenCalledTimes(1);
		const setCall = kvSet.mock.calls[0];
		expect(setCall[0]).toBe(`wallet_session:${sessionId}`);
		expect(setCall[2]).toEqual({ PX: SESSION_TTL_MS });

		const record = await readSession(sessionId);
		expect(record).not.toBeNull();
		expect(record?.walletAddress).toBe('0xabcdef0123456789012345678901234567890123');
		expect(record?.issuedAt).toBeGreaterThanOrEqual(before);
		expect(record?.lastSeenAt).toBe(record?.issuedAt);
	});

	it('readSession returns null for unknown session id', async () => {
		mockGetKv.mockResolvedValue({
			set: vi.fn(),
			get: vi.fn().mockResolvedValue(null),
			del: vi.fn()
		});
		const { readSession } = await import('./walletSession');
		expect(await readSession('unknown-session-id')).toBeNull();
	});

	it('maybeRefreshSession is a no-op within the 24h refresh window', async () => {
		const kvSet = vi.fn();
		mockGetKv.mockResolvedValue({ set: kvSet, get: vi.fn(), del: vi.fn() });

		const { maybeRefreshSession } = await import('./walletSession');

		const now = Date.now();
		const record = {
			walletAddress: '0xabc',
			issuedAt: now - 60 * 60 * 1000, // 1h ago
			lastSeenAt: now - 60 * 60 * 1000
		};

		await maybeRefreshSession('session-id-abc', record);

		expect(kvSet).not.toHaveBeenCalled();
	});

	it('maybeRefreshSession refreshes when last seen > 24h ago', async () => {
		const kvSet = vi.fn();
		mockGetKv.mockResolvedValue({ set: kvSet, get: vi.fn(), del: vi.fn() });

		const { maybeRefreshSession } = await import('./walletSession');

		const now = Date.now();
		const originalLastSeen = now - 25 * 60 * 60 * 1000;
		const record = {
			walletAddress: '0xabc',
			issuedAt: originalLastSeen,
			lastSeenAt: originalLastSeen // 25h ago — past threshold
		};

		await maybeRefreshSession('session-id-stale', record);

		expect(kvSet).toHaveBeenCalledTimes(1);
		const [key, value, opts] = kvSet.mock.calls[0];
		expect(key).toBe('wallet_session:session-id-stale');
		const parsed = JSON.parse(value as string);
		// lastSeenAt should be updated to ~now (after the refresh)
		expect(parsed.lastSeenAt).toBeGreaterThan(originalLastSeen);
		expect(opts).toEqual({ PX: SESSION_TTL_MS });
		// In-place mutation also updates the caller's record (sliding refresh)
		expect(record.lastSeenAt).toBeGreaterThan(originalLastSeen);
	});

	it('deleteSession calls kv.del; subsequent readSession returns null', async () => {
		const store = new Map<string, string>();
		const kvSet = vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		});
		const kvGet = vi.fn(async (key: string) => store.get(key) ?? null);
		const kvDel = vi.fn(async (key: string) => {
			store.delete(key);
		});
		mockGetKv.mockResolvedValue({ set: kvSet, get: kvGet, del: kvDel });

		const { createSession, deleteSession, readSession } = await import('./walletSession');

		const { sessionId } = await createSession('0xAbc');
		expect(await readSession(sessionId)).not.toBeNull();

		await deleteSession(sessionId);

		expect(kvDel).toHaveBeenCalledWith(`wallet_session:${sessionId}`);
		expect(await readSession(sessionId)).toBeNull();
	});

	it('readSession returns null when KV is unavailable', async () => {
		mockGetKv.mockResolvedValue(null);
		const { readSession } = await import('./walletSession');
		expect(await readSession('any-id')).toBeNull();
	});

	it('createSession throws when KV is unavailable (fails closed)', async () => {
		mockGetKv.mockResolvedValue(null);
		const { createSession } = await import('./walletSession');
		await expect(createSession('0xabc')).rejects.toThrow(/Session storage unavailable/);
	});
});
