import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifySessionToken } from '$lib/server/auth';
import { kv, KV_KEYS, type RewardsPoolConfig } from '$lib/server/kv';

// Helper to check admin auth from cookies
function isAuthenticated(cookies: { get: (name: string) => string | undefined }): boolean {
	const sessionToken = cookies.get('auth-session');
	const timestamp = cookies.get('auth-timestamp');

	if (!sessionToken || !timestamp) {
		return false;
	}

	return verifySessionToken(sessionToken, parseInt(timestamp, 10));
}

// GET - List all rewards pool configs or get a specific month
export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!isAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Return empty data if KV not configured (local dev)
	if (!kv) {
		return json({ pools: [], kvConfigured: false });
	}

	const month = url.searchParams.get('month');

	if (month) {
		// Get specific month's config
		const config = await kv.get<RewardsPoolConfig>(KV_KEYS.rewardsPool(month));

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
	const allMonths = (await kv.get<string[]>(KV_KEYS.rewardsPoolList())) || [];

	// Fetch all pool configs
	const pools: RewardsPoolConfig[] = [];
	for (const m of allMonths) {
		const config = await kv.get<RewardsPoolConfig>(KV_KEYS.rewardsPool(m));
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
	if (!isAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!kv) {
		return json(
			{ error: 'KV store not configured. Cannot modify rewards pool in local dev.' },
			{ status: 503 }
		);
	}

	try {
		const body = await request.json();
		const { month, poolAmount, kickerAmount, kickerTvlTarget, kickerHit, notes } = body;

		// Validate month format (YYYY-MM)
		if (!month || !/^\d{4}-\d{2}$/.test(month)) {
			return json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
		}

		// Validate amounts
		if (typeof poolAmount !== 'number' || poolAmount < 0) {
			return json({ error: 'Pool amount must be a non-negative number' }, { status: 400 });
		}

		if (typeof kickerAmount !== 'number' || kickerAmount < 0) {
			return json({ error: 'Kicker amount must be a non-negative number' }, { status: 400 });
		}

		if (typeof kickerTvlTarget !== 'number' || kickerTvlTarget < 0) {
			return json({ error: 'Kicker TVL target must be a non-negative number' }, { status: 400 });
		}

		const config: RewardsPoolConfig = {
			month,
			poolAmount,
			kickerAmount,
			kickerTvlTarget,
			kickerHit: Boolean(kickerHit),
			notes: notes || '',
			updatedAt: new Date().toISOString()
		};

		// Save pool config
		await kv.set(KV_KEYS.rewardsPool(month), config);

		// Update list of months
		const allMonths = (await kv.get<string[]>(KV_KEYS.rewardsPoolList())) || [];
		if (!allMonths.includes(month)) {
			allMonths.push(month);
			allMonths.sort((a, b) => b.localeCompare(a)); // Sort descending
			await kv.set(KV_KEYS.rewardsPoolList(), allMonths);
		}

		return json({ success: true, pool: config });
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};

// DELETE - Remove rewards pool config for a month
export const DELETE: RequestHandler = async ({ url, cookies }) => {
	if (!isAuthenticated(cookies)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

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

	// Delete the pool config
	await kv.del(KV_KEYS.rewardsPool(month));

	// Remove from list
	const allMonths = (await kv.get<string[]>(KV_KEYS.rewardsPoolList())) || [];
	const index = allMonths.indexOf(month);
	if (index !== -1) {
		allMonths.splice(index, 1);
		await kv.set(KV_KEYS.rewardsPoolList(), allMonths);
	}

	return json({ success: true });
};
