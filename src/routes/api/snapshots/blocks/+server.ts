// API endpoint to list snapshot blocks from KV
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kv, KV_KEYS, type SnapshotBlockRecord, type DailySnapshotRecord } from '$lib/server/kv';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const date = url.searchParams.get('date'); // YYYY-MM-DD format
		const limit = parseInt(url.searchParams.get('limit') || '100');

		if (!kv) {
			return json({ error: 'KV storage not configured' }, { status: 503 });
		}

		// If date is specified, get blocks for that specific date
		if (date) {
			const dailyRecord = await kv.get<DailySnapshotRecord>(KV_KEYS.snapshotBlocksByDate(date));

			if (!dailyRecord) {
				return json({
					success: true,
					date,
					blocks: [],
					message: 'No snapshots found for this date'
				});
			}

			return json({
				success: true,
				date,
				blocks: dailyRecord.blocks,
				generatedAt: dailyRecord.generatedAt
			});
		}

		// Otherwise, get all blocks (with limit)
		const allBlocks = (await kv.get<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];

		// Sort by block number descending (most recent first)
		const sortedBlocks = [...allBlocks].sort((a, b) => b.blockNumber - a.blockNumber);

		// Apply limit
		const limitedBlocks = sortedBlocks.slice(0, limit);

		// Group by date for easier consumption
		const blocksByDate: Record<string, SnapshotBlockRecord[]> = {};
		for (const block of limitedBlocks) {
			if (!blocksByDate[block.date]) {
				blocksByDate[block.date] = [];
			}
			blocksByDate[block.date].push(block);
		}

		return json({
			success: true,
			totalBlocks: allBlocks.length,
			returnedBlocks: limitedBlocks.length,
			blocks: limitedBlocks,
			blocksByDate
		});
	} catch (error) {
		console.error('[Snapshot Blocks] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
