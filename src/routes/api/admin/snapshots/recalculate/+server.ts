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
import { invalidatePublicApiCaches } from '$lib/server/cache';
import type { BlockSnapshot } from '$lib/server/snapshots/types';
import { env } from '$env/dynamic/private';

const POINTS_PER_DOLLAR = 100;

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

		// Get excluded wallets
		const excludedWallets = (await kvGet<string[]>(KV_KEYS.excludedWallets())) || [];
		const excludedSet = new Set(excludedWallets.map((w) => w.toLowerCase()));

		// Get existing monthly data to compare
		const existingData = await kvGet<MonthlyPointsData>(KV_KEYS.monthlyPoints(month));
		const existingWalletCount = existingData ? Object.keys(existingData.wallets).length : 0;
		const existingTotalPoints = existingData
			? Object.values(existingData.wallets).reduce((sum, w) => sum + w.totalPoints, 0)
			: 0;

		// Track excluded wallets that had points
		const excludedWithPoints: { address: string; points: number }[] = [];

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

		// Debug: show sample blob paths
		if (allBlobs.length > 0) {
			const samplePaths = allBlobs.slice(0, 3).map((b) => b.pathname);
			console.log(`[Recalculate] Sample blob pathnames: ${JSON.stringify(samplePaths)}`);
		}

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
		console.log(
			`[Recalculate] All blob block numbers: ${Array.from(allBlobBlocks)
				.slice(0, 10)
				.join(', ')}...`
		);

		// Parse blob paths and filter for our target blocks
		const blobsForMonth: Array<{
			token: string;
			blockNumber: number;
			url: string;
		}> = [];

		for (const blob of allBlobs) {
			const pathParts = blob.pathname.split('/');
			const fileName = pathParts[pathParts.length - 1];
			const tokenSymbol = pathParts[pathParts.length - 2];
			const blockNumber = parseInt(fileName.replace('.json', ''));

			if (targetBlocks.has(blockNumber)) {
				blobsForMonth.push({
					token: tokenSymbol,
					blockNumber,
					url: blob.url
				});
			}
		}

		console.log(`[Recalculate] Found ${blobsForMonth.length} blobs for target blocks`);

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
		const processedBlocks = new Set<number>();

		// Process each blob
		for (const blobInfo of blobsForMonth) {
			try {
				console.log(`[Recalculate] Fetching ${blobInfo.token} at block ${blobInfo.blockNumber}`);

				const response = await fetch(blobInfo.url);
				if (!response.ok) {
					console.log(`[Recalculate] Failed to fetch ${blobInfo.url}`);
					continue;
				}

				const snapshot: BlockSnapshot = await response.json();
				tokensProcessed.add(blobInfo.token);
				processedBlocks.add(blobInfo.blockNumber);

				// Calculate points from this snapshot
				const price = snapshot.price?.price ?? 0;
				const tokenAddress = snapshot.tokenAddress.toLowerCase();

				console.log(
					`[Recalculate] ${blobInfo.token}: price=${price}, balances=${
						Object.keys(snapshot.balances).length
					}`
				);

				for (const [walletAddress, balanceStr] of Object.entries(snapshot.balances)) {
					const address = walletAddress.toLowerCase();
					const balance = BigInt(balanceStr);

					// Skip negative balances (can occur from transfer replay ordering issues)
					if (balance <= 0n) continue;

					const balanceFloat = Number(balance) / 1e18;
					const usdValue = balanceFloat * price;
					const points = usdValue * POINTS_PER_DOLLAR;

					// Skip excluded wallets but track their points
					if (excludedSet.has(address)) {
						// Track excluded wallet's points for reporting
						const existing = excludedWithPoints.find((e) => e.address === address);
						if (existing) {
							existing.points += points;
						} else {
							excludedWithPoints.push({ address, points });
						}
						continue;
					}

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
				console.error(`[Recalculate] Error processing ${blobInfo.url}:`, err);
			}
		}

		// Update snapshot count and block numbers
		monthlyData.blockNumbers = Array.from(processedBlocks).sort((a, b) => a - b);
		monthlyData.snapshotCount = processedBlocks.size;

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

		console.log(
			`[Recalculate] Completed: ${
				monthlyData.snapshotCount
			} snapshots, ${walletCount} wallets, ${Math.round(
				totalPointsRecalculated
			).toLocaleString()} total points`
		);
		console.log(`[Recalculate] Tokens processed: ${Array.from(tokensProcessed).join(', ')}`);
		console.log(`[Recalculate] Block numbers: ${monthlyData.blockNumbers.join(', ')}`);

		// Debug: show first few wallets
		const walletSample = Object.entries(monthlyData.wallets).slice(0, 3);
		console.log(`[Recalculate] Sample wallets:`, JSON.stringify(walletSample, null, 2));

		// Calculate total excluded points
		const totalExcludedPoints = excludedWithPoints.reduce((sum, e) => sum + e.points, 0);

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
				walletsRemoved: existingWalletCount - walletCount,
				pointsRemoved: Math.round(existingTotalPoints - totalPointsRecalculated)
			},
			excludedWalletsApplied: excludedWithPoints
				.filter((e) => e.points > 0)
				.map((e) => ({
					address: e.address,
					pointsExcluded: Math.round(e.points)
				})),
			totalExcludedPoints: Math.round(totalExcludedPoints),
			debug: {
				blocksFound: monthBlocks.length,
				totalBlobsInStorage: allBlobs.length,
				blobsMatchingMonth: blobsForMonth.length,
				excludedWalletsCount: excludedWallets.length,
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
