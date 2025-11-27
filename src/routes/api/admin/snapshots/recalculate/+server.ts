// Recalculate monthly points from existing blob snapshots
// This is useful if snapshots were generated before points tracking was working
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { list } from '@vercel/blob';
import {
	kvGet,
	kvSet,
	KV_KEYS,
	type MonthlyPointsData,
	type SnapshotBlockRecord
} from '$lib/server/kv';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { TOKENS } from '$lib/config/tokens';

const POINTS_PER_DOLLAR = 100;

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		// Verify admin session
		const token = cookies.get('auth-session');
		const tsStr = cookies.get('auth-timestamp');

		if (!token || !tsStr) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const body = await request.json();
		const { month } = body;

		// Validate month format (YYYY-MM)
		if (!month || !/^\d{4}-\d{2}$/.test(month)) {
			return json({ error: 'Invalid month format. Use YYYY-MM' }, { status: 400 });
		}

		console.log(`[Recalculate] Starting recalculation for ${month}`);

		// Get all canonical blocks
		const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];

		// Filter to blocks in the specified month
		const monthBlocks = allBlocks.filter((b) => b.date.startsWith(month));

		if (monthBlocks.length === 0) {
			return json({ error: `No snapshot blocks found for ${month}` }, { status: 404 });
		}

		console.log(`[Recalculate] Found ${monthBlocks.length} blocks for ${month}`);

		// Get excluded wallets
		const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
		const excludedSet = new Set(excludedWallets.map((w) => w.toLowerCase()));

		// Initialize new monthly data
		const monthlyData: MonthlyPointsData = {
			month,
			snapshotCount: 0,
			blockNumbers: [],
			wallets: {},
			updatedAt: new Date().toISOString()
		};

		let totalPointsRecalculated = 0;
		const tokensProcessed = new Set<string>();

		// Process each block
		for (const blockRecord of monthBlocks) {
			console.log(`[Recalculate] Processing block ${blockRecord.blockNumber}`);

			// Fetch all token snapshots for this block from blob storage
			for (const token of TOKENS) {
				const blobPath = `snapshots/${token.symbol}/${blockRecord.blockNumber}.json`;

				try {
					// List blobs to find the exact URL
					const { blobs } = await list({ prefix: blobPath });

					if (blobs.length === 0) {
						console.log(
							`[Recalculate] No blob found for ${token.symbol} at block ${blockRecord.blockNumber}`
						);
						continue;
					}

					// Fetch the snapshot
					const response = await fetch(blobs[0].url);
					if (!response.ok) {
						console.log(`[Recalculate] Failed to fetch ${blobPath}`);
						continue;
					}

					const snapshot: BlockSnapshot = await response.json();
					tokensProcessed.add(token.symbol);

					// Calculate points from this snapshot
					const price = snapshot.price?.price ?? 0;
					const tokenAddress = snapshot.tokenAddress.toLowerCase();

					for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
						const address = walletAddress.toLowerCase();

						// Skip excluded wallets
						if (excludedSet.has(address)) {
							continue;
						}

						const balance = BigInt(balanceStr);
						const balanceFloat = Number(balance) / 1e18;
						const usdValue = balanceFloat * price;
						const points = usdValue * POINTS_PER_DOLLAR;

						if (!monthlyData.wallets[address]) {
							monthlyData.wallets[address] = {
								tokens: {},
								totalPoints: 0
							};
						}

						const wallet = monthlyData.wallets[address];

						if (!wallet.tokens[tokenAddress]) {
							wallet.tokens[tokenAddress] = {
								points: 0,
								lastBalance: '0'
							};
						}

						wallet.tokens[tokenAddress].points += points;
						wallet.tokens[tokenAddress].lastBalance = balanceStr;
						wallet.totalPoints += points;
						totalPointsRecalculated += points;
					}
				} catch (err) {
					console.error(`[Recalculate] Error processing ${blobPath}:`, err);
				}
			}

			monthlyData.blockNumbers.push(blockRecord.blockNumber);
			monthlyData.snapshotCount += 1;
		}

		// Save updated data
		await kvSet(KV_KEYS.monthlyPoints(month), monthlyData);

		// Update list of months if needed
		const monthsList = (await kvGet<string[]>(KV_KEYS.monthlyPointsList())) || [];
		if (!monthsList.includes(month)) {
			monthsList.push(month);
			monthsList.sort();
			await kvSet(KV_KEYS.monthlyPointsList(), monthsList);
		}

		console.log(
			`[Recalculate] Completed: ${monthlyData.snapshotCount} snapshots, ${
				Object.keys(monthlyData.wallets).length
			} wallets, ${Math.round(totalPointsRecalculated).toLocaleString()} total points`
		);

		return json({
			success: true,
			month,
			snapshotCount: monthlyData.snapshotCount,
			blockNumbers: monthlyData.blockNumbers,
			walletCount: Object.keys(monthlyData.wallets).length,
			totalPoints: Math.round(totalPointsRecalculated),
			tokensProcessed: Array.from(tokensProcessed)
		});
	} catch (error) {
		console.error('[Recalculate] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
