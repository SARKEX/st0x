// API endpoint to list available snapshots from Vercel Blob
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { list } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const tokenSymbol = url.searchParams.get('token');
		const limit = parseInt(url.searchParams.get('limit') || '50');

		// List blobs with optional token filter
		const prefix = tokenSymbol ? `snapshots/${tokenSymbol}/` : 'snapshots/';

		const { blobs } = await list({
			prefix,
			limit,
			token: BLOB_READ_WRITE_TOKEN
		});

		// Parse blob paths to extract metadata
		const snapshots = blobs.map((blob) => {
			const pathParts = blob.pathname.split('/');
			const fileName = pathParts[pathParts.length - 1];
			const token = pathParts[pathParts.length - 2];
			const blockNumber = fileName.replace('.json', '');

			return {
				token,
				blockNumber: parseInt(blockNumber),
				url: blob.url,
				size: blob.size,
				uploadedAt: blob.uploadedAt
			};
		});

		// Sort by block number descending (most recent first)
		snapshots.sort((a, b) => b.blockNumber - a.blockNumber);

		return json({
			success: true,
			count: snapshots.length,
			snapshots
		});
	} catch (error) {
		console.error('[Snapshot List] Error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
