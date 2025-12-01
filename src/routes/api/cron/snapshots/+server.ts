// Cron job endpoint for daily snapshot generation
// Runs at 0:01 UTC daily, picks 2 random blocks from previous day (one from each half)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { put } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private';
import {
	generateAllTokenSnapshots_v2,
	getBlockTimestamp,
	getBlockNumberForTimestamp
} from '$lib/server/snapshots/generator';
import { updateMonthlyPoints } from '$lib/server/snapshots/points';
import {
	getKv,
	kvGet,
	kvSet,
	KV_KEYS,
	type SnapshotBlockRecord,
	type DailySnapshotRecord
} from '$lib/server/kv';

// Pick a random block within a range
function pickRandomBlock(startBlock: number, endBlock: number): number {
	const range = endBlock - startBlock;
	return Math.floor(Math.random() * range) + startBlock;
}

// Pick 2 random blocks - one from first half of range, one from second half
function pickRandomBlocksFromHalves(startBlock: number, endBlock: number): [number, number] {
	const midBlock = Math.floor((startBlock + endBlock) / 2);
	const block1 = pickRandomBlock(startBlock, midBlock);
	const block2 = pickRandomBlock(midBlock, endBlock);
	return [block1, block2];
}

export const GET: RequestHandler = async ({ request }) => {
	try {
		// Verify cron secret if configured (for Vercel cron protection)
		const authHeader = request.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;

		if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		// Calculate yesterday's timestamp range (UTC)
		const now = new Date();
		const yesterdayEnd = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
		);
		const yesterdayStart = new Date(yesterdayEnd.getTime() - 86400 * 1000);

		const startTimestamp = Math.floor(yesterdayStart.getTime() / 1000);
		const endTimestamp = Math.floor(yesterdayEnd.getTime() / 1000) - 1;

		const dateStr = yesterdayStart.toISOString().split('T')[0]; // YYYY-MM-DD

		console.log(`[Cron] Generating snapshots for ${dateStr}`);
		console.log(`[Cron] Timestamp range: ${startTimestamp} - ${endTimestamp}`);

		// Get block range for yesterday
		const startBlock = await getBlockNumberForTimestamp(startTimestamp);
		const endBlock = await getBlockNumberForTimestamp(endTimestamp);

		console.log(`[Cron] Block range: ${startBlock} - ${endBlock}`);

		// Pick 2 random blocks - one from first half of day, one from second half
		const [block1, block2] = pickRandomBlocksFromHalves(startBlock, endBlock);

		console.log(`[Cron] Selected blocks: ${block1} (first half), ${block2} (second half)`);

		const blockRecords: SnapshotBlockRecord[] = [];
		const storedBlobs: { block: number; token: string; url: string }[] = [];

		// Generate and store snapshots for both blocks
		for (const blockNumber of [block1, block2]) {
			// Use core generator function (same as preview)
			const snapshots = await generateAllTokenSnapshots_v2(blockNumber);
			const timestamp = await getBlockTimestamp(blockNumber);

			console.log(`[Cron] Generated ${snapshots.length} token snapshots for block ${blockNumber}`);

			// Store each token's snapshot to blob
			for (const snapshot of snapshots) {
				const blobPath = `snapshots/${snapshot.tokenSymbol}/${blockNumber}.json`;

				const blob = await put(blobPath, JSON.stringify(snapshot, null, 2), {
					access: 'public',
					contentType: 'application/json',
					token: BLOB_READ_WRITE_TOKEN
				});

				storedBlobs.push({
					block: blockNumber,
					token: snapshot.tokenSymbol,
					url: blob.url
				});

				console.log(`[Cron] Stored ${snapshot.tokenSymbol} at block ${blockNumber}`);
			}

			// Update monthly points with this snapshot's data
			await updateMonthlyPoints(snapshots, blockNumber, timestamp);

			blockRecords.push({
				blockNumber,
				timestamp,
				date: dateStr,
				generatedAt: new Date().toISOString()
			});
		}

		// Store block records in KV
		const kv = await getKv();
		if (kv) {
			// Store daily record
			const dailyRecord: DailySnapshotRecord = {
				date: dateStr,
				blocks: blockRecords,
				generatedAt: new Date().toISOString()
			};

			await kvSet(KV_KEYS.snapshotBlocksByDate(dateStr), dailyRecord);

			// Append to master list of all blocks
			const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];
			allBlocks.push(...blockRecords);

			// Keep only last 365 days worth of blocks (730 records at 2 per day)
			const trimmedBlocks = allBlocks.slice(-730);
			await kvSet(KV_KEYS.snapshotBlocks(), trimmedBlocks);

			console.log(`[Cron] Stored block records in KV`);
		}

		return json({
			success: true,
			date: dateStr,
			blocks: blockRecords,
			blobsStored: storedBlobs.length,
			blobs: storedBlobs
		});
	} catch (error) {
		console.error('[Cron] Error generating snapshots:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// POST endpoint for manual triggering with custom parameters
export const POST: RequestHandler = async ({ request }) => {
	// For manual triggers, redirect to GET handler logic
	// This maintains backwards compatibility
	return json({
		message: 'Use GET request instead. Vercel Cron uses GET by default.',
		hint: 'The cron job has been moved to the GET handler.'
	});
};
