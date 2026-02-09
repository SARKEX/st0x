// API endpoint to retrieve snapshots by block and token from Vercel Blob
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { list } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { rateLimiters, applyRateLimit } from '$lib/server/rateLimit';
import { TOKENS } from '$lib/config/tokens';

export const GET: RequestHandler = async ({ url, request }) => {
	// Rate limiting
	const rateLimitResponse = await applyRateLimit(request, rateLimiters.snapshots, 'snapshots-get');
	if (rateLimitResponse) return rateLimitResponse;
	// Check if Blob token is available (required for Vercel Blob storage)
	if (!env.BLOB_READ_WRITE_TOKEN) {
		return json(
			{ error: 'Blob storage not configured (missing BLOB_READ_WRITE_TOKEN)' },
			{ status: 503 }
		);
	}

	try {
		const blockNumber = url.searchParams.get('block');
		const tokenSymbol = url.searchParams.get('token');

		if (!blockNumber) {
			return json({ error: 'Missing block parameter' }, { status: 400 });
		}

		// If token is specified, get that specific snapshot
		if (tokenSymbol) {
			const prefix = `snapshots/${tokenSymbol}/${blockNumber}.json`;

			const { blobs } = await list({ prefix, limit: 1, token: env.BLOB_READ_WRITE_TOKEN });

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
		// Query each token's specific blob path in parallel to avoid pagination issues
		const tokenSymbols = TOKENS.map((t) => t.symbol);

		const snapshots = (
			await Promise.all(
				tokenSymbols.map(async (symbol) => {
					const prefix = `snapshots/${symbol}/${blockNumber}.json`;
					try {
						const { blobs } = await list({
							prefix,
							limit: 1,
							token: env.BLOB_READ_WRITE_TOKEN
						});
						if (blobs.length === 0) return null;

						const response = await fetch(blobs[0].url);
						if (!response.ok) return { token: symbol, url: blobs[0].url, snapshot: null };

						const data = await response.json();
						return { token: symbol, url: blobs[0].url, snapshot: data };
					} catch {
						return null;
					}
				})
			)
		).filter((s) => s !== null);

		if (snapshots.length === 0) {
			return json(
				{
					success: false,
					error: `No snapshots found for block ${blockNumber}`
				},
				{ status: 404 }
			);
		}

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
