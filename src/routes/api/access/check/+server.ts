import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isWalletRegistered, getWalletInfo } from '$lib/server/accessCodes';
import { applyTieredRateLimit } from '$lib/server/rateLimit';
import { withCache } from '$lib/server/cache';

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

	// Get wallet address from cookie for tiered rate limiting
	// Only grant authenticated (higher) rate limits when checking your OWN address
	// This prevents using someone else's authenticated quota to enumerate wallets
	const cookieWallet = cookies.get('wallet-address');
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
