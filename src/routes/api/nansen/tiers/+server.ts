// Public API endpoint for Nansen tier data
// Returns cached tier data with 1-hour TTL

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getNansenTierData, getWalletTiers, type NansenTier } from '$lib/server/nansenTiers';

export const GET: RequestHandler = async ({ url }) => {
	try {
		// Check if specific addresses are requested
		const addressesParam = url.searchParams.get('addresses');

		if (addressesParam) {
			// Return tiers for specific addresses
			const addresses = addressesParam.split(',').map((a) => a.trim());
			const tiers = await getWalletTiers(addresses);

			return json({
				success: true,
				walletTiers: tiers
			});
		}

		// Return full tier data with stats
		const data = await getNansenTierData();

		return json({
			success: true,
			fetchedAt: data.fetchedAt,
			tierCounts: data.tierCounts,
			totalWallets: Object.keys(data.walletTiers).length,
			// Don't return full wallet list by default (too large)
			// Use ?addresses= parameter to lookup specific wallets
			walletTiers: {} as Record<string, { tier: NansenTier; points: number; rank: number }>
		});
	} catch (error) {
		console.error('[Nansen Tiers API] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
