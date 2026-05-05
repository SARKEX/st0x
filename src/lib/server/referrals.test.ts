import { beforeEach, describe, expect, it, vi } from 'vitest';

// referrals.ts imports from ./kv and ./accessCodes (which transitively pulls
// $env/dynamic/private + viem). The pure-function tests below only exercise
// generateReferralCode, but the import chain still needs to resolve cleanly.
vi.mock('./kv', () => ({
	getKv: vi.fn(async () => null),
	kvGet: vi.fn(),
	kvSet: vi.fn(),
	kvDel: vi.fn(),
	getRewardsExcludedWalletsSet: vi.fn(async () => new Set<string>()),
	KV_KEYS: {
		referralProfile: (w: string) => `referral_profile:${w}`,
		referralCodeToWallet: (c: string) => `referral_code_to_wallet:${c}`,
		allReferralProfiles: () => 'referral_profiles:__all__',
		codeWallets: (c: string) => `code_wallets:${c}`,
		monthlyPoints: (m: string) => `monthly_points:${m}`,
		rewardsPool: (m: string) => `rewards_pool:${m}`,
		wallet: (a: string) => `wallets:${a}`
	}
}));

// REL-02 / Plan 03-07: accessCodes.ts now wraps its publicClient in viem's
// `fallback([...])` Transport — the test viem mock must export `fallback` too,
// otherwise the transitive import via `referrals.ts -> accessCodes.ts` fails at
// module load with "No \"fallback\" export is defined on the \"viem\" mock".
vi.mock('viem', () => ({
	createPublicClient: vi.fn(() => ({ verifyMessage: vi.fn() })),
	http: vi.fn(() => ({})),
	fallback: vi.fn(() => ({}))
}));

vi.mock('viem/chains', () => ({ base: { id: 8453 } }));

vi.mock('$env/dynamic/private', () => ({ env: {} }));

describe('SEC-05 generateReferralCode CSPRNG', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.restoreAllMocks();
	});

	it('returns format st0x-ref-xxxxxx with 31-char alphabet', async () => {
		const { generateReferralCode } = await import('./referrals');
		const code = generateReferralCode();
		expect(code).toMatch(/^st0x-ref-[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
	});

	it('produces unique codes across 1000 calls', async () => {
		const { generateReferralCode } = await import('./referrals');
		const codes = new Set(Array.from({ length: 1000 }, () => generateReferralCode()));
		expect(codes.size).toBe(1000);
	});

	it('has roughly uniform distribution across 10000 samples (31-char alphabet, rejection sampling matters)', async () => {
		const { generateReferralCode } = await import('./referrals');
		const counts: Record<string, number> = {};
		for (let i = 0; i < 10000; i++) {
			const code = generateReferralCode();
			const body = code.slice('st0x-ref-'.length);
			for (const ch of body) counts[ch] = (counts[ch] || 0) + 1;
		}
		const totalPicks = 60000; // 10000 codes × 6 picks
		const expected = totalPicks / 31;
		// 10% wide tolerance; rejection sampling on the 31-char alphabet (~3% reject
		// rate, limit=248) prevents the modulo bias that would otherwise weight
		// indices 0-7 with 9/256 probability each vs 8/256 for indices 8-30.
		for (const count of Object.values(counts)) {
			expect(count).toBeGreaterThan(expected * 0.9);
			expect(count).toBeLessThan(expected * 1.1);
		}
	});

	it('rejects bytes >= 248 and re-rolls (rejection sampling structural witness)', async () => {
		const cryptoMod = await import('crypto');
		// Sequence: 250 (reject), 250 (reject), 5 (accept) for first pick, then
		// any low byte for the remaining 5 picks. limit = floor(256/31)*31 = 248.
		const sequence = [250, 250, 5, 0, 0, 0, 0, 0];
		let i = 0;
		const spy = vi.spyOn(cryptoMod.default, 'randomBytes').mockImplementation((size: number) => {
			const buf = Buffer.alloc(size as number);
			buf[0] = sequence[i++] ?? 0;
			return buf as unknown as Buffer;
		});
		const { generateReferralCode } = await import('./referrals');
		const code = generateReferralCode();
		// First accepted byte for the first pick was 5 → alphabet[5] = 'f'
		expect(code).toBe('st0x-ref-faaaaa');
		// Total calls: 3 (first pick rejection-then-accept) + 5 (remaining picks) = 8
		expect(spy).toHaveBeenCalledTimes(8);
		spy.mockRestore();
	});

	it('uses crypto.randomBytes (CSPRNG witness via spy)', async () => {
		const cryptoMod = await import('crypto');
		const spy = vi.spyOn(cryptoMod.default, 'randomBytes');
		const { generateReferralCode } = await import('./referrals');
		const code = generateReferralCode();
		expect(spy).toHaveBeenCalled();
		// Each call asks for exactly 1 byte (the per-pick CSPRNG draw shape).
		for (const call of spy.mock.calls) {
			expect(call[0]).toBe(1);
		}
		expect(code).toMatch(/^st0x-ref-[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
		spy.mockRestore();
	});
});
