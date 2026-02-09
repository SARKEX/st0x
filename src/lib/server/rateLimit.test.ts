import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetKv } = vi.hoisted(() => ({
	mockGetKv: vi.fn()
}));

vi.mock('./kv', () => ({
	getKv: mockGetKv
}));

describe('rateLimiters.admin', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockGetKv.mockResolvedValue(null);
	});

	it('uses strict fail-closed in-memory fallback when Redis is unavailable', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { rateLimiters } = await import('./rateLimit');
		const identifier = `admin-test-${Date.now()}-${Math.random()}`;

		const first = await rateLimiters.admin(identifier);
		expect(first.allowed).toBe(true);
		expect(first.failedClosed).toBe(true);

		for (let i = 0; i < 29; i++) {
			const result = await rateLimiters.admin(identifier);
			expect(result.allowed).toBe(true);
			expect(result.failedClosed).toBe(true);
		}

		const blocked = await rateLimiters.admin(identifier);
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
		expect(blocked.failedClosed).toBe(true);

		expect(warnSpy).toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});
