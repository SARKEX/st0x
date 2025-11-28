// API endpoint to generate and store balance snapshots
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { put } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private';
import { fetchAllTransfers, TOKEN_ADDRESSES } from '$lib/server/snapshots/scraper';
import { generateAllTokenSnapshots } from '$lib/server/snapshots/processor';
import { fetchPythPricesAtTimestamp } from '$lib/server/snapshots/pyth';
import { networks } from '$lib/config/networks';

// Get current block number from RPC
async function getCurrentBlockNumber(): Promise<number> {
	const network = networks[0];
	const rpcUrls = [network.rpcUrl, ...network.fallbackRpcUrls];

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

			if (!response.ok) continue;

			const data = await response.json();
			if (data.result) {
				return parseInt(data.result, 16);
			}
		} catch {
			continue;
		}
	}

	throw new Error('Failed to get current block number from any RPC');
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

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const targetBlock = body.blockNumber
			? parseInt(body.blockNumber)
			: await getCurrentBlockNumber();

		console.log(`[Snapshot] Generating snapshots for block ${targetBlock}`);

		// Get block timestamp
		const timestamp = await getBlockTimestamp(targetBlock);

		// Fetch all transfers up to target block
		const transfers = await fetchAllTransfers(targetBlock, TOKEN_ADDRESSES);

		console.log(`[Snapshot] Fetched ${transfers.length} transfers`);

		// Fetch Pyth prices at block timestamp (may be adjusted for market hours)
		console.log(`[Snapshot] Fetching Pyth prices at timestamp ${timestamp}`);
		const { prices, priceTimestamp } = await fetchPythPricesAtTimestamp(timestamp, TOKEN_ADDRESSES);

		// Generate snapshots for all tokens with prices
		const snapshots = generateAllTokenSnapshots(
			transfers,
			targetBlock,
			timestamp,
			TOKEN_ADDRESSES,
			prices,
			undefined, // vaultHoldings
			undefined, // dynamicExcluded
			priceTimestamp
		);

		// Store each snapshot as a blob
		const storedBlobs: { tokenSymbol: string; url: string }[] = [];

		for (const snapshot of snapshots) {
			const blobPath = `snapshots/${snapshot.tokenSymbol}/${targetBlock}.json`;

			const blob = await put(blobPath, JSON.stringify(snapshot, null, 2), {
				access: 'public',
				contentType: 'application/json',
				token: BLOB_READ_WRITE_TOKEN
			});

			storedBlobs.push({
				tokenSymbol: snapshot.tokenSymbol,
				url: blob.url
			});

			console.log(`[Snapshot] Stored ${snapshot.tokenSymbol} snapshot at ${blob.url}`);
		}

		return json({
			success: true,
			blockNumber: targetBlock,
			timestamp,
			tokensProcessed: snapshots.length,
			blobs: storedBlobs
		});
	} catch (error) {
		console.error('[Snapshot] Error generating snapshots:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

// GET endpoint to retrieve a specific snapshot
export const GET: RequestHandler = async ({ url }) => {
	const tokenSymbol = url.searchParams.get('token');
	const blockNumber = url.searchParams.get('block');

	if (!tokenSymbol || !blockNumber) {
		return json({ error: 'Missing token or block parameter' }, { status: 400 });
	}

	// For retrieval, we redirect to the blob URL
	const blobPath = `snapshots/${tokenSymbol}/${blockNumber}.json`;

	return json({
		message: 'Use the blob URL directly to retrieve snapshots',
		expectedPath: blobPath
	});
};
