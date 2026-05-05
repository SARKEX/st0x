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

describe('session_login purpose (SEC-03)', () => {
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

	it('issueSessionLoginChallenge returns nonce + message + expiresAt', async () => {
		const { issueSessionLoginChallenge } = await import('./signatureChallenge');
		const challenge = await issueSessionLoginChallenge(
			'0xAbCdef0123456789012345678901234567890123'
		);
		expect(challenge.nonce).toMatch(/^[a-f0-9]{32}$/);
		expect(challenge.message).toContain('Wallet: 0xabcdef0123456789012345678901234567890123');
		expect(challenge.message).toContain(`Nonce: ${challenge.nonce}`);
		expect(challenge.expiresAt).toBeGreaterThan(Date.now());
	});

	it('verifySessionLoginChallenge returns valid=true on first call, valid=false on second (atomic GET+DEL)', async () => {
		const { issueSessionLoginChallenge, verifySessionLoginChallenge } = await import(
			'./signatureChallenge'
		);

		const address = '0xAbC';
		const challenge = await issueSessionLoginChallenge(address);

		const first = await verifySessionLoginChallenge(address, challenge.nonce);
		expect(first.valid).toBe(true);
		expect(first.message).toBe(challenge.message);

		// Second call: same nonce → consumed → must reject (atomic GET+DEL invariant)
		const second = await verifySessionLoginChallenge(address, challenge.nonce);
		expect(second.valid).toBe(false);
		expect(second.error).toBe('Missing or already used challenge');
	});

	it('verifySessionLoginChallenge uses atomic eval Lua script when getDel unavailable', async () => {
		const now = Date.now();
		const address = '0xAbC';
		const normalizedAddress = address.toLowerCase();
		const nonce = 'session-login-nonce-123';

		const record = {
			purpose: 'session_login',
			address: normalizedAddress,
			nonce,
			message: 'Sign in to st0x',
			issuedAt: now,
			expiresAt: now + 60_000,
			context: {}
		};

		const mockEval = vi
			.fn()
			.mockResolvedValueOnce(JSON.stringify(record))
			.mockResolvedValueOnce(null);

		mockGetKv.mockResolvedValue({
			eval: mockEval
		});

		const { verifySessionLoginChallenge } = await import('./signatureChallenge');

		const first = await verifySessionLoginChallenge(address, nonce);
		expect(first.valid).toBe(true);

		const second = await verifySessionLoginChallenge(address, nonce);
		expect(second.valid).toBe(false);

		const expectedKey = `signature_challenge:session_login:${normalizedAddress}:${nonce}`;
		expect(mockEval).toHaveBeenNthCalledWith(1, expect.stringContaining("redis.call('GET'"), {
			keys: [expectedKey]
		});
	});

	it('issueSessionLoginChallenge fails closed in production when challenge storage is unavailable', async () => {
		process.env.NODE_ENV = 'production';
		const { issueSessionLoginChallenge, ChallengeStorageUnavailableError } = await import(
			'./signatureChallenge'
		);

		await expect(issueSessionLoginChallenge('0xAbC')).rejects.toBeInstanceOf(
			ChallengeStorageUnavailableError
		);
	});
});
