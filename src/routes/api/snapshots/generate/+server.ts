// API endpoint to generate and store balance snapshots
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { put } from '@vercel/blob';
import {
	generateAllTokenSnapshots,
	getCurrentBlockNumber,
	getBlockTimestamp
} from '$lib/server/snapshots/generator';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const targetBlock = body.blockNumber
			? parseInt(body.blockNumber)
			: await getCurrentBlockNumber();

		console.log(`[Snapshot] Generating snapshots for block ${targetBlock}`);

		// Use the same generator as cron and preview
		const snapshots = await generateAllTokenSnapshots(targetBlock);
		const timestamp = await getBlockTimestamp(targetBlock);

		console.log(`[Snapshot] Generated ${snapshots.length} token snapshots`);

		// Store each snapshot as a blob
		const storedBlobs: { tokenSymbol: string; url: string }[] = [];

		for (const snapshot of snapshots) {
			const blobPath = `snapshots/${snapshot.tokenSymbol}/${targetBlock}.json`;

			const blob = await put(blobPath, JSON.stringify(snapshot, null, 2), {
				access: 'public',
				contentType: 'application/json'
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
