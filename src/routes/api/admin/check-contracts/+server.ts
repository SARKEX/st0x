// API endpoint to check which addresses are smart contracts vs EOAs
// Uses RPC to detect pool types
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPoolType, type PoolType } from '$lib/server/snapshots/pool-discovery';
import { requireAdmin } from '$lib/server/adminAuth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-check-contracts');
	if (guardResponse) return guardResponse;

	try {
		const { addresses } = await request.json();

		if (!Array.isArray(addresses) || addresses.length === 0) {
			return json({ error: 'addresses must be a non-empty array' }, { status: 400 });
		}

		// Limit to 100 addresses per request to avoid timeouts
		const addressesToCheck = addresses.slice(0, 100);

		// Check each address in parallel using the shared getPoolType function
		const results = await Promise.all(
			addressesToCheck.map(async (address: string) => {
				const poolType = await getPoolType(address);
				return { address: address.toLowerCase(), contractType: poolType };
			})
		);

		// Convert to a map for easy lookup
		const contractMap: Record<string, PoolType> = {};
		for (const result of results) {
			contractMap[result.address] = result.contractType;
		}

		return json({
			success: true,
			contracts: contractMap,
			checkedCount: addressesToCheck.length
		});
	} catch (error) {
		console.error('[Check Contracts] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
