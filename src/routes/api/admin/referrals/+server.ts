// API endpoint to get referral code data with associated wallets
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifySessionToken } from '$lib/server/auth';
import { listAccessCodes, getWalletsByCode } from '$lib/server/accessCodes';

// Helper to check admin auth from cookies
function isAuthenticated(cookies: { get: (name: string) => string | undefined }): boolean {
	const sessionToken = cookies.get('auth-session');
	const timestamp = cookies.get('auth-timestamp');

	if (!sessionToken || !timestamp) {
		return false;
	}

	return verifySessionToken(sessionToken, parseInt(timestamp, 10));
}

interface ReferralCodeData {
	code: string;
	label: string | null;
	wallets: string[];
	createdAt: string;
}

export const GET: RequestHandler = async ({ cookies }) => {
	if (!isAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// Get all access codes
		const codes = await listAccessCodes();

		// Get wallets for each code
		const referralData: ReferralCodeData[] = await Promise.all(
			codes.map(async (code) => {
				const wallets = await getWalletsByCode(code.code);
				return {
					code: code.code,
					label: code.label,
					wallets,
					createdAt: code.createdAt
				};
			})
		);

		// Sort by number of wallets descending
		referralData.sort((a, b) => b.wallets.length - a.wallets.length);

		return json({
			success: true,
			referrals: referralData
		});
	} catch (error) {
		console.error('[Referrals API] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
