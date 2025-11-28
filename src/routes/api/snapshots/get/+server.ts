// API endpoint to retrieve snapshots by block and token from Vercel Blob
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { list } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const blockNumber = url.searchParams.get('block');
		const tokenSymbol = url.searchParams.get('token');

		if (!blockNumber) {
			return json({ error: 'Missing block parameter' }, { status: 400 });
		}

		// If token is specified, get that specific snapshot
		if (tokenSymbol) {
			const prefix = `snapshots/${tokenSymbol}/${blockNumber}.json`;

			const { blobs } = await list({ prefix, limit: 1, token: BLOB_READ_WRITE_TOKEN });

			if (blobs.length === 0) {
				return json(
					{
						success: false,
						error: `Snapshot not found for ${tokenSymbol} at block ${blockNumber}`
					},
					{ status: 404 }
				);
			}

			// Fetch the actual snapshot data
			const snapshotResponse = await fetch(blobs[0].url);
			if (!snapshotResponse.ok) {
				return json({ error: 'Failed to fetch snapshot data' }, { status: 500 });
			}

			const snapshotData = await snapshotResponse.json();

			return json({
				success: true,
				blockNumber: parseInt(blockNumber),
				token: tokenSymbol,
				url: blobs[0].url,
				snapshot: snapshotData
			});
		}

		// If no token specified, get all token snapshots for this block
		const prefix = `snapshots/`;

		const { blobs } = await list({ prefix, token: BLOB_READ_WRITE_TOKEN });

		// Filter blobs for this block number
		const blockSnapshots = blobs.filter((blob) => {
			const pathParts = blob.pathname.split('/');
			const fileName = pathParts[pathParts.length - 1];
			return fileName === `${blockNumber}.json`;
		});

		if (blockSnapshots.length === 0) {
			return json(
				{
					success: false,
					error: `No snapshots found for block ${blockNumber}`
				},
				{ status: 404 }
			);
		}

		// Fetch all snapshot data
		const snapshots = await Promise.all(
			blockSnapshots.map(async (blob) => {
				const pathParts = blob.pathname.split('/');
				const token = pathParts[pathParts.length - 2];

				try {
					const response = await fetch(blob.url);
					if (response.ok) {
						const data = await response.json();
						return {
							token,
							url: blob.url,
							snapshot: data
						};
					}
				} catch {
					// Skip failed fetches
				}

				return {
					token,
					url: blob.url,
					snapshot: null
				};
			})
		);

		return json({
			success: true,
			blockNumber: parseInt(blockNumber),
			tokensFound: snapshots.length,
			snapshots
		});
	} catch (error) {
		console.error('[Snapshot Get] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
