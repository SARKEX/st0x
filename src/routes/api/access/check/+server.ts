import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isWalletRegistered, getWalletInfo } from '$lib/server/accessCodes';
import { applyTieredRateLimit } from '$lib/server/rateLimit';
import { withCache } from '$lib/server/cache';
import { readSession } from '$lib/server/walletSession';

// Cache TTL for access check (5 minutes - registration status rarely changes)
const ACCESS_CHECK_CACHE_TTL = 5 * 60;

export const GET: RequestHandler = async ({ url, request, cookies }) => {
	const address = url.searchParams.get('address');

	if (!address) {
		return json({ error: 'Address parameter required' }, { status: 400 });
	}

	// Basic address validation
	if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
		return json({ error: 'Invalid address format' }, { status: 400 });
	}

	// SEC-03 (Plan 03-08b atomic flip): wallet for tiered rate limiting is now
	// derived from the server-issued 'session' cookie + KV record, not from the
	// spoofable client-set 'wallet-address' cookie. Only grant authenticated
	// (higher) rate limits when checking your OWN address — prevents using
	// someone else's authenticated quota to enumerate wallets.
	const sessionId = cookies.get('session');
	let cookieWallet: string | null = null;
	if (sessionId && /^[a-f0-9]{64}$/.test(sessionId)) {
		const record = await readSession(sessionId);
		cookieWallet = record?.walletAddress ?? null;
	}
	const isOwnAddress = cookieWallet?.toLowerCase() === address.toLowerCase();
	const walletForRateLimit = isOwnAddress ? address : null;

	// Tiered rate limiting - only authenticated users checking their own address get higher limits
	const rateLimitResponse = await applyTieredRateLimit(
		request,
		'accessCheck',
		'access-check',
		walletForRateLimit
	);
	if (rateLimitResponse) return rateLimitResponse;

	// Cache the registration check per address
	const cacheKey = `cache:access:check:${address.toLowerCase()}`;
	const result = await withCache(
		cacheKey,
		async () => {
			const registered = await isWalletRegistered(address);

			if (registered) {
				const walletInfo = await getWalletInfo(address);
				return {
					registered: true,
					registeredAt: walletInfo?.registeredAt
				};
			}

			return { registered: false };
		},
		ACCESS_CHECK_CACHE_TTL
	);

	return json(result);
};
