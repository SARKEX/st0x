// API endpoint to get referral code data with associated wallets
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminAuthenticated } from '$lib/server/adminAuth';
import { listAccessCodes, getWalletsByCode } from '$lib/server/accessCodes';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';

interface ReferralCodeData {
	code: string;
	label: string | null;
	wallets: string[];
	createdAt: string;
}

export const GET: RequestHandler = async ({ cookies, request }) => {
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.admin, 'admin-referrals');
	if (rateLimitResponse) return rateLimitResponse;

	if (!isAdminAuthenticated(cookies)) {
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
