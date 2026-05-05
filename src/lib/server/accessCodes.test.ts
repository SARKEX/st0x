import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockGetKv,
	mockVerifyMessage,
	mockFallback,
	mockHttp,
	mockCreatePublicClient,
	mockRecordRpcAttempt,
	mockReportChainExhausted
} = vi.hoisted(() => ({
	mockGetKv: vi.fn(),
	mockVerifyMessage: vi.fn(),
	mockFallback: vi.fn((transports: unknown[], opts: unknown) => ({
		__isFallback: true,
		transports,
		opts
	})),
	mockHttp: vi.fn((url: string) => ({ __isHttp: true, url })),
	mockCreatePublicClient: vi.fn(() => ({
		verifyMessage: (...args: unknown[]) => mockVerifyMessage(...args)
	})),
	mockRecordRpcAttempt: vi.fn(),
	mockReportChainExhausted: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./kv', () => ({
	getKv: mockGetKv,
	kvGet: vi.fn(),
	kvSet: vi.fn(),
	kvDel: vi.fn(),
	KV_KEYS: {
		accessCode: (code: string) => `access_codes:${code.toUpperCase()}`,
		wallet: (address: string) => `wallets:${address.toLowerCase()}`,
		codeWallets: (code: string) => `code_wallets:${code.toUpperCase()}`,
		allCodes: () => 'access_codes:__all__'
	}
}));

vi.mock('viem', () => ({
	createPublicClient: mockCreatePublicClient,
	http: mockHttp,
	fallback: mockFallback
}));

vi.mock('$lib/server/rpcMetrics', () => ({
	recordRpcAttempt: mockRecordRpcAttempt,
	reportChainExhausted: mockReportChainExhausted
}));

vi.mock('viem/chains', () => ({
	base: { id: 8453 }
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		REDIS_URL: ''
	}
}));

describe('processRegistration', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NODE_ENV = 'test';
		mockGetKv.mockResolvedValue(null);
		mockVerifyMessage.mockResolvedValue(true);
	});

	afterAll(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	it('returns service unavailable in production when Redis is unavailable', async () => {
		process.env.NODE_ENV = 'production';
		const { processRegistration, REGISTRATION_SERVICE_UNAVAILABLE_ERROR } = await import(
			'./accessCodes'
		);

		const result = await processRegistration(
			'0xabc',
			'ST0X-TEST-CODE',
			'0xdeadbeef' as `0x${string}`,
			'Sign to verify wallet ownership'
		);

		expect(result).toEqual({
			success: false,
			error: REGISTRATION_SERVICE_UNAVAILABLE_ERROR
		});
	});

	it('continues to use in-memory fallback in non-production', async () => {
		process.env.NODE_ENV = 'test';
		const { processRegistration } = await import('./accessCodes');

		const result = await processRegistration(
			'0xabc',
			'ST0X-MISSING',
			'0xdeadbeef' as `0x${string}`,
			'Sign to verify wallet ownership'
		);

		expect(result.success).toBe(false);
		expect(result.error).toBe('Invalid access code');
	});
});

describe('SEC-05 generateAccessCode CSPRNG', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('returns format ST0X-XXXX-XXXX with 32-char alphabet', async () => {
		const { generateAccessCode } = await import('./accessCodes');
		const code = generateAccessCode();
		expect(code).toMatch(/^ST0X-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
	});

	it('produces unique codes across 1000 calls', async () => {
		const { generateAccessCode } = await import('./accessCodes');
		const codes = new Set(Array.from({ length: 1000 }, () => generateAccessCode()));
		expect(codes.size).toBe(1000);
	});

	it('has roughly uniform distribution across 10000 samples', async () => {
		const { generateAccessCode } = await import('./accessCodes');
		const counts: Record<string, number> = {};
		for (let i = 0; i < 10000; i++) {
			const code = generateAccessCode();
			// strip "ST0X-" prefix and the dash between groups → 8 random chars
			const body = code.slice('ST0X-'.length).replace('-', '');
			for (const ch of body) counts[ch] = (counts[ch] || 0) + 1;
		}
		const totalPicks = 80000; // 10000 codes × 8 picks
		const expected = totalPicks / 32;
		for (const count of Object.values(counts)) {
			// 10% wide tolerance to avoid flake; 32-char clean modulo (limit=256) means no rejection
			expect(count).toBeGreaterThan(expected * 0.9);
			expect(count).toBeLessThan(expected * 1.1);
		}
	});

	it('uses crypto.randomBytes (CSPRNG witness via spy)', async () => {
		const cryptoMod = await import('crypto');
		const spy = vi.spyOn(cryptoMod.default, 'randomBytes');
		const { generateAccessCode } = await import('./accessCodes');
		const code = generateAccessCode();
		// 32-char alphabet, limit = 256 → no rejection; exactly 8 byte draws per code.
		expect(spy).toHaveBeenCalled();
		// Witness: each call asks for exactly 1 byte (the per-pick CSPRNG draw shape).
		for (const call of spy.mock.calls) {
			expect(call[0]).toBe(1);
		}
		expect(code).toMatch(/^ST0X-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
		spy.mockRestore();
	});
});

// REL-02 / Plan 03-07: viem fallback Transport for verifyWalletSignature.
// Pins (a) basePublicClient construction shape uses fallback([http, http, ...], { retryCount, retryDelay, rank }),
// (b) verifyWalletSignature OBS-04 fan-out uses the new 'fallback-chain-base' label, NOT the
// legacy 'alchemy-base-mainnet' literal, (c) RESEARCH Pitfall 7 — no withRetry wrap (viem's
// fallback transport already retries per-transport internally; outer wrap = multiplicative).
describe('REL-02 fallback transport for verifyWalletSignature', () => {
	const originalBaseRpcUrl = process.env.BASE_RPC_URL;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.BASE_RPC_URL = 'https://base-mainnet.example.com/v2/test-key';
		// Ensure mocks return their default factory shape after clearAllMocks().
		mockFallback.mockImplementation((transports: unknown[], opts: unknown) => ({
			__isFallback: true,
			transports,
			opts
		}));
		mockHttp.mockImplementation((url: string) => ({ __isHttp: true, url }));
		mockCreatePublicClient.mockImplementation(() => ({
			verifyMessage: (...args: unknown[]) => mockVerifyMessage(...args)
		}));
		mockReportChainExhausted.mockResolvedValue(undefined);
	});

	afterAll(() => {
		if (originalBaseRpcUrl !== undefined) process.env.BASE_RPC_URL = originalBaseRpcUrl;
		else delete process.env.BASE_RPC_URL;
	});

	it('constructs basePublicClient with fallback transport (retryCount=2, retryDelay=200, rank=false)', async () => {
		await import('./accessCodes');
		expect(mockFallback).toHaveBeenCalled();
		const [transports, opts] = mockFallback.mock.calls[0];
		expect(Array.isArray(transports)).toBe(true);
		expect((transports as unknown[]).length).toBeGreaterThanOrEqual(2);
		expect(opts).toMatchObject({ retryCount: 2, retryDelay: 200, rank: false });
	});

	it('records ok=true with fallback-chain-base label on successful verification', async () => {
		mockVerifyMessage.mockResolvedValue(true);
		const { verifyWalletSignature } = await import('./accessCodes');
		const result = await verifyWalletSignature(
			'0x' + '1'.repeat(40),
			'message',
			('0x' + '2'.repeat(130)) as `0x${string}`
		);
		expect(result).toBe(true);
		expect(mockRecordRpcAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				rpc_url: 'fallback-chain-base',
				fn: 'verifyWalletSignature',
				ok: true,
				status_or_error: 'verified'
			})
		);
	});

	it('records ok=true status=mismatch when verification returns false', async () => {
		mockVerifyMessage.mockResolvedValue(false);
		const { verifyWalletSignature } = await import('./accessCodes');
		const result = await verifyWalletSignature(
			'0x' + '1'.repeat(40),
			'message',
			('0x' + '2'.repeat(130)) as `0x${string}`
		);
		expect(result).toBe(false);
		expect(mockRecordRpcAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				rpc_url: 'fallback-chain-base',
				fn: 'verifyWalletSignature',
				ok: true,
				status_or_error: 'mismatch'
			})
		);
	});

	it('records ok=false + reports chain exhausted when verifyMessage throws', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockVerifyMessage.mockRejectedValue(new Error('Network unreachable'));
		const { verifyWalletSignature } = await import('./accessCodes');
		const result = await verifyWalletSignature(
			'0x' + '1'.repeat(40),
			'message',
			('0x' + '2'.repeat(130)) as `0x${string}`
		);
		expect(result).toBe(false);
		expect(mockRecordRpcAttempt).toHaveBeenCalledWith(
			expect.objectContaining({
				rpc_url: 'fallback-chain-base',
				fn: 'verifyWalletSignature',
				ok: false
			})
		);
		expect(mockReportChainExhausted).toHaveBeenCalledWith(
			expect.objectContaining({
				fn: 'verifyWalletSignature',
				attempts: expect.arrayContaining([
					expect.objectContaining({ rpc_url: 'fallback-chain-base' })
				])
			})
		);
		errorSpy.mockRestore();
	});
});
