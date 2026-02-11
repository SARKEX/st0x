import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetKv } = vi.hoisted(() => ({
	mockGetKv: vi.fn()
}));

vi.mock('./kv', () => ({
	getKv: mockGetKv
}));

describe('signatureChallenge', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		process.env.NODE_ENV = 'test';
		mockGetKv.mockResolvedValue(null);
	});

	afterAll(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	it('fails closed in production when challenge storage is unavailable', async () => {
		process.env.NODE_ENV = 'production';
		const { issueAccessRegistrationChallenge, ChallengeStorageUnavailableError } = await import(
			'./signatureChallenge'
		);

		await expect(
			issueAccessRegistrationChallenge('0xAbC', 'st0x-test-code')
		).rejects.toBeInstanceOf(ChallengeStorageUnavailableError);
	});

	it('uses in-memory fallback in non-production and consumes a challenge once', async () => {
		const { issueAccessRegistrationChallenge, verifyAccessRegistrationChallenge } = await import(
			'./signatureChallenge'
		);

		const address = '0xAbC';
		const challenge = await issueAccessRegistrationChallenge(address, 'st0x-test-code');

		const firstVerification = await verifyAccessRegistrationChallenge(
			address,
			challenge.nonce,
			'ST0X-TEST-CODE'
		);
		expect(firstVerification.valid).toBe(true);

		const secondVerification = await verifyAccessRegistrationChallenge(
			address,
			challenge.nonce,
			'ST0X-TEST-CODE'
		);
		expect(secondVerification.valid).toBe(false);
		expect(secondVerification.error).toBe('Missing or already used challenge');
	});

	it('uses atomic eval fallback when getDel is unavailable', async () => {
		const now = Date.now();
		const address = '0xAbC';
		const normalizedAddress = address.toLowerCase();
		const nonce = 'nonce-123';
		const code = 'st0x-test-code';
		const normalizedCode = code.toUpperCase();

		const record = {
			purpose: 'access_register',
			address: normalizedAddress,
			nonce,
			message: 'Sign test message',
			issuedAt: now,
			expiresAt: now + 60_000,
			context: { accessCode: normalizedCode }
		};

		const mockEval = vi
			.fn()
			.mockResolvedValueOnce(JSON.stringify(record))
			.mockResolvedValueOnce(null);

		mockGetKv.mockResolvedValue({
			eval: mockEval
		});

		const { verifyAccessRegistrationChallenge } = await import('./signatureChallenge');

		const firstVerification = await verifyAccessRegistrationChallenge(address, nonce, code);
		expect(firstVerification.valid).toBe(true);

		const secondVerification = await verifyAccessRegistrationChallenge(address, nonce, code);
		expect(secondVerification.valid).toBe(false);
		expect(secondVerification.error).toBe('Missing or already used challenge');

		const expectedKey = `signature_challenge:access_register:${normalizedAddress}:${nonce}`;
		expect(mockEval).toHaveBeenNthCalledWith(1, expect.stringContaining("redis.call('GET'"), {
			keys: [expectedKey]
		});
	});
});
