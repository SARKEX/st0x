import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/adminAuth';
import {
	getKv,
	kvGet,
	kvSet,
	kvDel,
	KV_KEYS,
	type RewardsPoolConfig,
	type RocketBoostTiers
} from '$lib/server/kv';
import { invalidateRewardsCaches } from '$lib/server/cache';

// GET - List all rewards pool configs or get a specific month
export const GET: RequestHandler = async ({ url, cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-rewards-pool-get');
	if (guardResponse) return guardResponse;

	// Return empty data if KV not configured (local dev)
	const kv = await getKv();
	if (!kv) {
		return json({ pools: [], kvConfigured: false });
	}

	const month = url.searchParams.get('month');

	if (month) {
		// Get specific month's config
		const config = await kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(month));

		if (!config) {
			return json({
				success: true,
				pool: null,
				message: 'No pool config found for this month'
			});
		}

		return json({ success: true, pool: config });
	}

	// Get all months with pool configs
	const allMonths = (await kvGet<string[]>(KV_KEYS.rewardsPoolList())) || [];

	// Fetch all pool configs
	const pools: RewardsPoolConfig[] = [];
	for (const m of allMonths) {
		const config = await kvGet<RewardsPoolConfig>(KV_KEYS.rewardsPool(m));
		if (config) {
			pools.push(config);
		}
	}

	// Sort by month descending
	pools.sort((a, b) => b.month.localeCompare(a.month));

	return json({ success: true, pools, kvConfigured: true });
};

// POST - Create or update rewards pool config
export const POST: RequestHandler = async ({ request, cookies }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-rewards-pool-update');
	if (guardResponse) return guardResponse;

	const kv = await getKv();
	if (!kv) {
		return json(
			{ error: 'KV store not configured. Cannot modify rewards pool in local dev.' },
			{ status: 503 }
		);
	}

	try {
		const body = await request.json();
		const { month, poolAmount, rocketBoostAmounts, rocketBoostTvlTarget, notes } = body;

		// Validate month format (YYYY-MM)
		if (!month || !/^\d{4}-\d{2}$/.test(month)) {
			return json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
		}

		// Validate amounts
		if (typeof poolAmount !== 'number' || poolAmount < 0) {
			return json({ error: 'Pool amount must be a non-negative number' }, { status: 400 });
		}

		// Validate RocketBoost amounts object
		if (!rocketBoostAmounts || typeof rocketBoostAmounts !== 'object') {
			return json(
				{ error: 'RocketBoost amounts must be an object with tier values' },
				{ status: 400 }
			);
		}

		const validatedRocketBoostAmounts: RocketBoostTiers = {
			tier25: 0,
			tier50: 0,
			tier75: 0,
			tier100: 0
		};

		for (const tier of ['tier25', 'tier50', 'tier75', 'tier100'] as const) {
			const value = rocketBoostAmounts[tier];
			if (typeof value !== 'number' || value < 0) {
				return json(
					{ error: `RocketBoost ${tier} amount must be a non-negative number` },
					{ status: 400 }
				);
			}
			validatedRocketBoostAmounts[tier] = value;
		}

		if (typeof rocketBoostTvlTarget !== 'number' || rocketBoostTvlTarget < 0) {
			return json(
				{ error: 'RocketBoost TVL target must be a non-negative number' },
				{ status: 400 }
			);
		}

		const config: RewardsPoolConfig = {
			month,
			poolAmount,
			rocketBoostAmounts: validatedRocketBoostAmounts,
			rocketBoostTvlTarget,
			notes: notes || '',
			updatedAt: new Date().toISOString()
		};

		// Save pool config
		await kvSet(KV_KEYS.rewardsPool(month), config);

		// Update list of months
		const allMonths = (await kvGet<string[]>(KV_KEYS.rewardsPoolList())) || [];
		if (!allMonths.includes(month)) {
			allMonths.push(month);
			allMonths.sort((a, b) => b.localeCompare(a)); // Sort descending
			await kvSet(KV_KEYS.rewardsPoolList(), allMonths);
		}

		// Invalidate cached rewards data so the main website picks up the new pool config
		await invalidateRewardsCaches();

		return json({ success: true, pool: config });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

// DELETE - Remove rewards pool config for a month
export const DELETE: RequestHandler = async ({ url, cookies, request }) => {
	const guardResponse = await requireAdmin(request, cookies, 'admin-rewards-pool-delete');
	if (guardResponse) return guardResponse;

	const kv = await getKv();
	if (!kv) {
		return json(
			{ error: 'KV store not configured. Cannot modify rewards pool in local dev.' },
			{ status: 503 }
		);
	}

	const month = url.searchParams.get('month');

	if (!month) {
		return json({ error: 'Month parameter required' }, { status: 400 });
	}

	if (!/^\d{4}-\d{2}$/.test(month)) {
		return json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
	}

	// Delete the pool config
	await kvDel(KV_KEYS.rewardsPool(month));

	// Remove from list
	const allMonths = (await kvGet<string[]>(KV_KEYS.rewardsPoolList())) || [];
	const index = allMonths.indexOf(month);
	if (index !== -1) {
		allMonths.splice(index, 1);
		await kvSet(KV_KEYS.rewardsPoolList(), allMonths);
	}

	return json({ success: true });
};
