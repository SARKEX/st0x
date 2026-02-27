// Manual snapshot trigger endpoint for admin
// Allows generating snapshots for a specific date (overwrites existing)
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { put } from '@vercel/blob';
import {
	generateAllTokenSnapshots,
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
import { requireAdmin } from '$lib/server/adminAuth';
import { invalidateRewardsCaches } from '$lib/server/cache';

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

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const guardResponse = await requireAdmin(request, cookies, 'admin-snapshots-trigger');
		if (guardResponse) return guardResponse;

		const body = await request.json();
		const { date, confirmText } = body;

		// Validate confirmation
		if (confirmText !== 'CONFIRM') {
			return json({ error: 'Invalid confirmation' }, { status: 400 });
		}

		// Validate date format (YYYY-MM-DD)
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
		}

		// Parse the date and validate it's not in the future
		const targetDate = new Date(date + 'T00:00:00Z');
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);

		if (targetDate >= today) {
			return json(
				{ error: 'Cannot generate snapshots for today or future dates' },
				{ status: 400 }
			);
		}

		const dateStr = date; // Already in YYYY-MM-DD format

		// Calculate timestamp range for the target date (full day in UTC)
		const startTimestamp = Math.floor(targetDate.getTime() / 1000);
		const endTimestamp = startTimestamp + 86400 - 1; // End of day

		console.log(`[Manual Trigger] Generating snapshots for ${dateStr}`);
		console.log(`[Manual Trigger] Timestamp range: ${startTimestamp} - ${endTimestamp}`);

		// Get block range for the target date
		const startBlock = await getBlockNumberForTimestamp(startTimestamp);
		const endBlock = await getBlockNumberForTimestamp(endTimestamp);

		console.log(`[Manual Trigger] Block range: ${startBlock} - ${endBlock}`);

		// Pick 2 random blocks - one from first half of day, one from second half
		const [block1, block2] = pickRandomBlocksFromHalves(startBlock, endBlock);

		console.log(
			`[Manual Trigger] Selected blocks: ${block1} (first half), ${block2} (second half)`
		);

		const storedBlobs: { block: number; token: string; url: string }[] = [];

		// Process a single block: generate snapshots, upload to blob, update points
		const processBlock = async (blockNumber: number) => {
			const [snapshots, timestamp] = await Promise.all([
				generateAllTokenSnapshots(blockNumber),
				getBlockTimestamp(blockNumber)
			]);

			console.log(
				`[Manual Trigger] Generated ${snapshots.length} token snapshots for block ${blockNumber}`
			);

			// Upload all token snapshots in parallel
			const blobResults = await Promise.all(
				snapshots.map(async (snapshot) => {
					const blobPath = `snapshots/${snapshot.tokenSymbol}/${blockNumber}.json`;
					const blob = await put(blobPath, JSON.stringify(snapshot, null, 2), {
						access: 'public',
						contentType: 'application/json'
					});
					console.log(`[Manual Trigger] Stored ${snapshot.tokenSymbol} at block ${blockNumber}`);
					return { block: blockNumber, token: snapshot.tokenSymbol, url: blob.url };
				})
			);

			storedBlobs.push(...blobResults);

			await updateMonthlyPoints(snapshots, blockNumber, timestamp);

			return {
				blockNumber,
				timestamp,
				date: dateStr,
				generatedAt: new Date().toISOString()
			} satisfies SnapshotBlockRecord;
		};

		// Generate both blocks in parallel
		const blockRecords = await Promise.all([processBlock(block1), processBlock(block2)]);

		// Store block records in KV
		const kv = await getKv();
		if (kv) {
			// Store/overwrite daily record
			const dailyRecord: DailySnapshotRecord = {
				date: dateStr,
				blocks: blockRecords,
				generatedAt: new Date().toISOString()
			};

			await kvSet(KV_KEYS.snapshotBlocksByDate(dateStr), dailyRecord);

			// Update master list: remove old records for this date, add new ones
			const allBlocks = (await kvGet<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];
			const filteredBlocks = allBlocks.filter((b) => b.date !== dateStr);
			filteredBlocks.push(...blockRecords);

			// Sort by date descending, then by block number
			filteredBlocks.sort((a, b) => {
				if (a.date !== b.date) return b.date.localeCompare(a.date);
				return b.blockNumber - a.blockNumber;
			});

			// Keep only last 365 days worth of blocks (730 records at 2 per day)
			const trimmedBlocks = filteredBlocks.slice(0, 730);
			await kvSet(KV_KEYS.snapshotBlocks(), trimmedBlocks);

			console.log(`[Manual Trigger] Stored block records in KV`);
		}

		// Invalidate all rewards and TVL caches so fresh data is computed
		await invalidateRewardsCaches();

		return json({
			success: true,
			date: dateStr,
			blocks: blockRecords,
			blobsStored: storedBlobs.length,
			blobs: storedBlobs
		});
	} catch (error) {
		console.error('[Manual Trigger] Error generating snapshots:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

export const config = {
	maxDuration: 800
};
