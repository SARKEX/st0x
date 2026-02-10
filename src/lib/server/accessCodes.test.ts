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

	it('fails closed for captcha when secret is missing in production', async () => {
		process.env.NODE_ENV = 'production';
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { verifyCaptcha } = await import('./accessCodes');

		const valid = await verifyCaptcha('captcha-token');
		expect(valid).toBe(false);
		expect(errorSpy).toHaveBeenCalledWith('HCAPTCHA_SECRET not configured in production');
		errorSpy.mockRestore();
	});

	it('allows captcha bypass when secret is missing in non-production', async () => {
		process.env.NODE_ENV = 'test';
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { verifyCaptcha } = await import('./accessCodes');

		const valid = await verifyCaptcha('captcha-token');
		expect(valid).toBe(true);
		expect(warnSpy).toHaveBeenCalledWith(
			'HCAPTCHA_SECRET not configured, skipping captcha verification'
		);
		warnSpy.mockRestore();
	});
});
