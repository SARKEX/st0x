import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetKv, mockVerifyMessage } = vi.hoisted(() => ({
	mockGetKv: vi.fn(),
	mockVerifyMessage: vi.fn()
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
	createPublicClient: vi.fn(() => ({
		verifyMessage: mockVerifyMessage
	})),
	http: vi.fn(() => ({}))
}));

vi.mock('viem/chains', () => ({
	base: { id: 8453 }
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		HCAPTCHA_SECRET: '',
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

	it('fails closed for captcha when secret is missing (default — VERCEL_ENV undefined)', async () => {
		// SEC-07 / Plan 03-04: Without VERCEL_ENV='development', verifyCaptcha
		// fails closed regardless of NODE_ENV. The static $env/dynamic/private
		// mock at the top of this file does not set VERCEL_ENV, so the gate
		// evaluates `undefined !== 'development'` → true → return false.
		process.env.NODE_ENV = 'production';
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { verifyCaptcha } = await import('./accessCodes');

		const valid = await verifyCaptcha('captcha-token');
		expect(valid).toBe(false);
		expect(errorSpy).toHaveBeenCalledWith(
			expect.stringContaining('HCAPTCHA_SECRET not configured')
		);
		errorSpy.mockRestore();
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

describe('SEC-07 verifyCaptcha VERCEL_ENV fail-closed', () => {
	const originalVercelEnv = process.env.VERCEL_ENV;
	const originalHcaptchaSecret = process.env.HCAPTCHA_SECRET;
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
		delete process.env.VERCEL_ENV;
		delete process.env.HCAPTCHA_SECRET;
		// Override the static $env/dynamic/private mock with a Proxy that reads from
		// process.env at access time so per-test setup of VERCEL_ENV / HCAPTCHA_SECRET
		// flows through to the verifyCaptcha gate. Same shape as Plan 03-02's auth.test.ts
		// / csrf.test.ts solution: SvelteKit's $env/dynamic/private is populated from
		// process.env at module load, and esm-env caching prevents top-level mock changes
		// after first node_modules transform — so we re-doMock per test under a Proxy.
		vi.doMock('$env/dynamic/private', () => ({
			env: new Proxy({} as Record<string, string | undefined>, {
				get: (_t, prop: string) => process.env[prop]
			})
		}));
	});

	afterAll(() => {
		if (originalVercelEnv !== undefined) process.env.VERCEL_ENV = originalVercelEnv;
		else delete process.env.VERCEL_ENV;
		if (originalHcaptchaSecret !== undefined) process.env.HCAPTCHA_SECRET = originalHcaptchaSecret;
		else delete process.env.HCAPTCHA_SECRET;
		process.env.NODE_ENV = originalNodeEnv;
	});

	it('fails closed in production when HCAPTCHA_SECRET missing', async () => {
		process.env.VERCEL_ENV = 'production';
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { verifyCaptcha } = await import('./accessCodes');
		expect(await verifyCaptcha('any-token')).toBe(false);
		errorSpy.mockRestore();
	});

	it('fails closed in PREVIEW when HCAPTCHA_SECRET missing (SEC-07 bug fix)', async () => {
		process.env.VERCEL_ENV = 'preview';
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { verifyCaptcha } = await import('./accessCodes');
		expect(await verifyCaptcha('any-token')).toBe(false);
		errorSpy.mockRestore();
	});

	it('tolerates missing HCAPTCHA_SECRET in local development', async () => {
		process.env.VERCEL_ENV = 'development';
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { verifyCaptcha } = await import('./accessCodes');
		expect(await verifyCaptcha('any-token')).toBe(true);
		warnSpy.mockRestore();
	});

	it('calls hcaptcha siteverify when secret is set', async () => {
		process.env.VERCEL_ENV = 'production';
		process.env.HCAPTCHA_SECRET = 'test-secret';
		const fetchMock = vi.fn().mockResolvedValue({
			json: async () => ({ success: true })
		});
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(global as any).fetch = fetchMock;
		const { verifyCaptcha } = await import('./accessCodes');
		expect(await verifyCaptcha('any-token')).toBe(true);
		expect(fetchMock).toHaveBeenCalledWith(
			'https://hcaptcha.com/siteverify',
			expect.objectContaining({ method: 'POST' })
		);
	});
});
