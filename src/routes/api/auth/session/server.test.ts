import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyWalletSignature: vi.fn(),
	verifySessionLoginChallenge: vi.fn(),
	createSession: vi.fn(),
	getServerApplicationCatalog: vi.fn()
}));

vi.mock('$app/environment', () => ({ dev: true }));
vi.mock('$lib/server/rateLimit', () => ({
	rateLimiters: { authStrict: {} },
	applyRateLimit: vi.fn(async () => null)
}));
vi.mock('$lib/server/accessCodes', () => ({
	verifyWalletSignature: mocks.verifyWalletSignature
}));
vi.mock('$lib/server/signatureChallenge', () => ({
	verifySessionLoginChallenge: mocks.verifySessionLoginChallenge
}));
vi.mock('$lib/server/walletSession', () => ({ createSession: mocks.createSession }));
vi.mock('$lib/server/applicationCatalog', () => ({
	getServerApplicationCatalog: mocks.getServerApplicationCatalog
}));

import { POST } from './+server';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const NETWORK = { id: 8453, chainId: 8453 };
type SessionEvent = Parameters<typeof POST>[0];

function event(body: unknown): SessionEvent {
	return {
		request: new Request('http://localhost/api/auth/session', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies: { set: vi.fn() }
	} as unknown as SessionEvent;
}

function validBody(chainId: unknown = 8453) {
	return { address: ADDRESS, nonce: 'nonce', signature: '0xsignature', chainId };
}

describe('/api/auth/session', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.verifySessionLoginChallenge.mockResolvedValue({ valid: true, message: 'challenge' });
		mocks.getServerApplicationCatalog.mockResolvedValue({
			tokenCatalog: [],
			networkCatalog: [NETWORK, { id: 10, chainId: 10 }]
		});
		mocks.verifyWalletSignature.mockResolvedValue(true);
		mocks.createSession.mockResolvedValue({ sessionId: 'session', expiresAt: 123 });
	});

	it.each([null, '8453', 8453.5, Number.NaN])(
		'rejects an invalid chainId value: %s',
		async (chainId) => {
			const response = await POST(event(validBody(chainId)));

			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: 'chainId must be an integer' });
			expect(mocks.verifyWalletSignature).not.toHaveBeenCalled();
		}
	);

	it('verifies a valid numeric chain against the requested network', async () => {
		const response = await POST(event(validBody()));

		expect(response.status).toBe(200);
		expect(mocks.verifyWalletSignature).toHaveBeenCalledWith(
			ADDRESS,
			'challenge',
			'0xsignature',
			NETWORK
		);
	});

	it('reports catalog failures as server errors rather than malformed JSON', async () => {
		mocks.getServerApplicationCatalog.mockRejectedValue(new Error('catalog unavailable'));

		const response = await POST(event(validBody()));

		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({ error: 'Unable to create session' });
	});
});
