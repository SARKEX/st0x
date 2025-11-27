// Cron job endpoint for daily snapshot generation
// Runs at 0:01 UTC daily, picks 2 random blocks from previous day
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { put } from '@vercel/blob';
import { fetchAllTransfers, TOKEN_ADDRESSES } from '$lib/server/snapshots/scraper';
import { generateAllTokenSnapshots } from '$lib/server/snapshots/processor';
import { fetchPythPricesAtTimestamp } from '$lib/server/snapshots/pyth';
import { updateMonthlyAverages } from '$lib/server/snapshots/averages';
import { fetchAllVaultHoldings } from '$lib/server/snapshots/vaults';
import { kv, KV_KEYS, type SnapshotBlockRecord, type DailySnapshotRecord } from '$lib/server/kv';
import { networks } from '$lib/config/networks';

// Get block number for a specific timestamp using binary search via RPC
async function getBlockNumberForTimestamp(targetTimestamp: number): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	// Get current block as upper bound
	let latestBlock = 0;
	for (const rpcUrl of rpcUrls) {
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_blockNumber',
					params: [],
					id: 1
				})
			});
			if (response.ok) {
				const data = await response.json();
				if (data.result) {
					latestBlock = parseInt(data.result, 16);
					break;
				}
			}
		} catch {
			continue;
		}
	}

	if (latestBlock === 0) {
		throw new Error('Failed to get latest block number');
	}

	// Binary search to find block closest to target timestamp
	let left = 0;
	let right = latestBlock;
	let closestBlock = latestBlock;
	let smallestDiff = Infinity;

	const getBlockTimestamp = async (blockNum: number): Promise<number | null> => {
		for (const rpcUrl of rpcUrls) {
			try {
				const response = await fetch(rpcUrl, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						jsonrpc: '2.0',
						method: 'eth_getBlockByNumber',
						params: [`0x${blockNum.toString(16)}`, false],
						id: 1
					})
				});
				if (response.ok) {
					const data = await response.json();
					if (data.result?.timestamp) {
						return parseInt(data.result.timestamp, 16);
					}
				}
			} catch {
				continue;
			}
		}
		return null;
	};

	// Perform binary search with limited iterations
	for (let i = 0; i < 30 && left <= right; i++) {
		const mid = Math.floor((left + right) / 2);
		const blockTimestamp = await getBlockTimestamp(mid);

		if (blockTimestamp === null) {
			right = mid - 1;
			continue;
		}

		const diff = Math.abs(blockTimestamp - targetTimestamp);
		if (diff < smallestDiff) {
			smallestDiff = diff;
			closestBlock = mid;
		}

		if (blockTimestamp < targetTimestamp) {
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}

	return closestBlock;
}

// Get block timestamp from RPC
async function getBlockTimestamp(blockNumber: number): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

	for (const rpcUrl of rpcUrls) {
		try {
			const response = await fetch(rpcUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					jsonrpc: '2.0',
					method: 'eth_getBlockByNumber',
					params: [`0x${blockNumber.toString(16)}`, false],
					id: 1
				})
			});

			if (!response.ok) continue;

			const data = await response.json();
			if (data.result?.timestamp) {
				return parseInt(data.result.timestamp, 16);
			}
		} catch {
			continue;
		}
	}

	throw new Error('Failed to get block timestamp from any RPC');
}

// Pick 2 random blocks within a range, ensuring they're different
function pickRandomBlocks(startBlock: number, endBlock: number): [number, number] {
	const range = endBlock - startBlock;

	const block1 = Math.floor(Math.random() * range) + startBlock;
	let block2 = Math.floor(Math.random() * range) + startBlock;

	// Ensure block2 is different from block1
	while (block2 === block1 && range > 0) {
		block2 = Math.floor(Math.random() * range) + startBlock;
	}

	// Return in ascending order
	return block1 < block2 ? [block1, block2] : [block2, block1];
}

export const POST: RequestHandler = async ({ request }) => {
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

		// Pick 2 random blocks
		const [block1, block2] = pickRandomBlocks(startBlock, endBlock);

		console.log(`[Cron] Selected blocks: ${block1}, ${block2}`);

		// Fetch all transfers up to the later block (we'll use same transfers for both)
		const transfers = await fetchAllTransfers(block2, TOKEN_ADDRESSES);

		console.log(`[Cron] Fetched ${transfers.length} transfers`);

		// Fetch vault holdings (to attribute orderbook holdings to vault owners)
		const vaultHoldings = await fetchAllVaultHoldings(TOKEN_ADDRESSES);

		console.log(`[Cron] Fetched ${vaultHoldings.length} vault holdings`);

		// Fetch excluded wallets from KV
		const excludedWallets = kv ? (await kv.get<string[]>(KV_KEYS.excludedWallets())) || [] : [];

		console.log(`[Cron] Fetched ${excludedWallets.length} excluded wallets`);

		const blockRecords: SnapshotBlockRecord[] = [];
		const storedBlobs: { block: number; token: string; url: string }[] = [];

		// Generate and store snapshots for both blocks
		for (const blockNumber of [block1, block2]) {
			const timestamp = await getBlockTimestamp(blockNumber);

			// Fetch Pyth prices at block timestamp
			console.log(`[Cron] Fetching Pyth prices at timestamp ${timestamp}`);
			const prices = await fetchPythPricesAtTimestamp(timestamp, TOKEN_ADDRESSES);

			const snapshots = generateAllTokenSnapshots(
				transfers,
				blockNumber,
				timestamp,
				TOKEN_ADDRESSES,
				prices,
				vaultHoldings,
				excludedWallets
			);

			for (const snapshot of snapshots) {
				const blobPath = `snapshots/${snapshot.tokenSymbol}/${blockNumber}.json`;

				const blob = await put(blobPath, JSON.stringify(snapshot, null, 2), {
					access: 'public',
					contentType: 'application/json'
				});

				storedBlobs.push({
					block: blockNumber,
					token: snapshot.tokenSymbol,
					url: blob.url
				});

				console.log(`[Cron] Stored ${snapshot.tokenSymbol} at block ${blockNumber}`);
			}

			// Update monthly running averages with this snapshot's data
			await updateMonthlyAverages(snapshots, blockNumber, timestamp);

			blockRecords.push({
				blockNumber,
				timestamp,
				date: dateStr,
				generatedAt: new Date().toISOString()
			});
		}

		// Store block records in KV
		if (kv) {
			// Store daily record
			const dailyRecord: DailySnapshotRecord = {
				date: dateStr,
				blocks: blockRecords,
				generatedAt: new Date().toISOString()
			};

			await kv.set(KV_KEYS.snapshotBlocksByDate(dateStr), dailyRecord);

			// Append to master list of all blocks
			const allBlocks = (await kv.get<SnapshotBlockRecord[]>(KV_KEYS.snapshotBlocks())) || [];
			allBlocks.push(...blockRecords);

			// Keep only last 365 days worth of blocks (730 records at 2 per day)
			const trimmedBlocks = allBlocks.slice(-730);
			await kv.set(KV_KEYS.snapshotBlocks(), trimmedBlocks);

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

// GET endpoint for manual triggering or status check
export const GET: RequestHandler = async () => {
	return json({
		message: 'Snapshot cron endpoint. Use POST to trigger snapshot generation.',
		schedule: '0 1 * * *', // 0:01 UTC daily
		description: 'Generates 2 random block snapshots for the previous day'
	});
};
