import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWalletsByCode, getWalletInfo } from '$lib/server/accessCodes';
import { isAdminAuthenticated } from '$lib/server/adminAuth';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

// GET - List wallets for a given access code
export const GET: RequestHandler = async ({ cookies, url, request }) => {
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.admin, 'admin-wallets-list');
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const code = url.searchParams.get('code');

	if (!code) {
		return json({ error: 'Access code required' }, { status: 400 });
	}

	// Get wallet addresses for this code
	const addresses = await getWalletsByCode(code);

	// Fetch full wallet info for each address
	const wallets = await Promise.all(
		addresses.map(async (address) => {
			const walletInfo = await getWalletInfo(address);
			return walletInfo;
		})
	);

	// Filter out any null results
	const validWallets = wallets.filter((w) => w !== null);

	return json({ wallets: validWallets });
};
