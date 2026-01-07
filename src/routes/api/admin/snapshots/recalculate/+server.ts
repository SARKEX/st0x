// Recalculate monthly points from existing blob snapshots
// Uses the same calculation logic as the daily cron for consistency
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { list } from '@vercel/blob';
import {
	kvGet,
	kvSet,
	KV_KEYS,
	getExcludedWalletsSet,
	type MonthlyPointsData,
	type SnapshotBlockRecord
} from '$lib/server/kv';
import { invalidatePublicApiCaches } from '$lib/server/cache';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { env } from '$env/dynamic/private';
import {
	calculateWalletPointsFromSnapshots,
	createEmptyMonthlyData,
	mergeWalletPointsIntoMonthlyData
} from '$lib/server/snapshots/points';

export const POST: RequestHandler = async ({ request, cookies }) => {
	// Check if Blob token is available (required for Vercel Blob storage)
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return json(
			{ error: 'Blob storage not configured (missing BLOB_READ_WRITE_TOKEN)' },
			{ status: 503 }
		);
	}

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

		// Get excluded wallets for reporting (not for filtering - that happens at query time)
		const excludedSet = await getExcludedWalletsSet();

		// Get existing monthly data to compare
		const existingData = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(month));
		const existingWalletCount = existingData ? Object.keys(existingData.wallets).length : 0;
		const existingTotalPoints = existingData
			? Object.values(existingData.wallets).reduce((sum, w) => sum + w.totalPoints, 0)
			: 0;

		// Create a set of block numbers we're looking for
		const targetBlocks = new Set(monthBlocks.map((b) => b.blockNumber));
		console.log(`[Recalculate] Target block numbers: ${Array.from(targetBlocks).join(', ')}`);

		// List ALL blobs from blob storage
		const { blobs: allBlobs } = await list({
			prefix: 'snapshots/',
			limit: 1000,
			token: env.BLOB_READ_WRITE_TOKEN
		});
		console.log(`[Recalculate] Found ${allBlobs.length} total blobs in storage`);

		// Debug: extract all block numbers from blobs
		const allBlobBlocks = new Set<number>();
		for (const blob of allBlobs) {
			const pathParts = blob.pathname.split('/');
			const fileName = pathParts[pathParts.length - 1];
			const blockNumber = parseInt(fileName.replace('.json', ''));
			if (!isNaN(blockNumber)) {
				allBlobBlocks.add(blockNumber);
			}
		}

		// Group blobs by block number
		const blobsByBlock = new Map<number, Array<{ token: string; url: string }>>();

		for (const blob of allBlobs) {
			const pathParts = blob.pathname.split('/');
			const fileName = pathParts[pathParts.length - 1];
			const tokenSymbol = pathParts[pathParts.length - 2];
			const blockNumber = parseInt(fileName.replace('.json', ''));

			if (targetBlocks.has(blockNumber)) {
				if (!blobsByBlock.has(blockNumber)) {
					blobsByBlock.set(blockNumber, []);
				}
				blobsByBlock.get(blockNumber)!.push({
					token: tokenSymbol,
					url: blob.url
				});
			}
		}

		console.log(`[Recalculate] Found blobs for ${blobsByBlock.size} blocks`);

		// Initialize new monthly data using shared function
		const monthlyData = createEmptyMonthlyData(month);

		const tokensProcessed = new Set<string>();

		// Process each block using the same functions as the daily cron
		for (const [blockNumber, blobs] of blobsByBlock) {
			try {
				console.log(`[Recalculate] Processing block ${blockNumber} with ${blobs.length} tokens`);

				// Fetch all snapshots for this block
				const snapshots: BlockSnapshot[] = [];
				for (const blobInfo of blobs) {
					const response = await fetch(blobInfo.url);
					if (response.ok) {
						const snapshot: BlockSnapshot = await response.json();
						snapshots.push(snapshot);
						tokensProcessed.add(blobInfo.token);
					}
				}

				if (snapshots.length === 0) continue;

				// Use the same calculation function as updateMonthlyPoints (includes LP attribution)
				const walletPoints = await calculateWalletPointsFromSnapshots(snapshots, blockNumber);

				// Use shared merge function - same logic as updateMonthlyPoints
				mergeWalletPointsIntoMonthlyData(monthlyData, walletPoints, blockNumber);

				console.log(
					`[Recalculate] Block ${blockNumber}: ${walletPoints.size} wallets with points`
				);
			} catch (err) {
				console.error(`[Recalculate] Error processing block ${blockNumber}:`, err);
			}
		}

		// Floor all points to 0 (reset any negative points)
		for (const wallet of Object.values(monthlyData.wallets)) {
			wallet.totalPoints = Math.max(0, wallet.totalPoints);
			for (const tokenData of Object.values(wallet.tokens)) {
				tokenData.points = Math.max(0, tokenData.points);
			}
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

		const walletCount = Object.keys(monthlyData.wallets).length;
		const totalPointsRecalculated = Object.values(monthlyData.wallets).reduce(
			(sum, w) => sum + w.totalPoints,
			0
		);

		// Calculate excluded wallet stats for reporting (they're stored, but excluded at query time)
		const excludedWalletsInData = Object.entries(monthlyData.wallets)
			.filter(([address]) => excludedSet.has(address))
			.map(([address, data]) => ({
				address,
				points: Math.round(data.totalPoints)
			}))
			.filter((e) => e.points > 0);

		const totalExcludedPoints = excludedWalletsInData.reduce((sum, e) => sum + e.points, 0);

		console.log(
			`[Recalculate] Completed: ${monthlyData.snapshotCount} snapshots, ${walletCount} wallets, ${Math.round(
				totalPointsRecalculated
			).toLocaleString()} total points`
		);
		console.log(`[Recalculate] Tokens processed: ${Array.from(tokensProcessed).join(', ')}`);
		console.log(`[Recalculate] Block numbers: ${monthlyData.blockNumbers.join(', ')}`);

		// Invalidate public API caches so they reflect new data immediately
		await invalidatePublicApiCaches();

		return json({
			success: true,
			month,
			snapshotCount: monthlyData.snapshotCount,
			blockNumbers: monthlyData.blockNumbers,
			walletCount,
			totalPoints: Math.round(totalPointsRecalculated),
			tokensProcessed: Array.from(tokensProcessed),
			comparison: {
				previousWalletCount: existingWalletCount,
				previousTotalPoints: Math.round(existingTotalPoints),
				walletDelta: walletCount - existingWalletCount,
				pointsDelta: Math.round(totalPointsRecalculated - existingTotalPoints)
			},
			// Excluded wallets are stored but filtered at query time - show for visibility
			excludedWalletsInfo: {
				count: excludedWalletsInData.length,
				totalPoints: Math.round(totalExcludedPoints),
				wallets: excludedWalletsInData.slice(0, 10) // Top 10 for brevity
			},
			debug: {
				blocksFound: monthBlocks.length,
				totalBlobsInStorage: allBlobs.length,
				blobsMatchingMonth: blobsByBlock.size,
				excludedWalletsCount: excludedSet.size,
				targetBlockNumbers: Array.from(targetBlocks),
				sampleBlobPaths: allBlobs.slice(0, 3).map((b) => b.pathname),
				allBlobBlockNumbers: Array.from(allBlobBlocks).slice(0, 10)
			}
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
