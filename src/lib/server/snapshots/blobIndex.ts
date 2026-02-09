import { list } from '@vercel/blob';

export interface SnapshotBlobEntry {
	token: string;
	url: string;
}

export interface SnapshotBlobIndex {
	totalBlobsInStorage: number;
	sampleBlobPaths: string[];
	allBlobBlockNumbers: number[];
	blobsByBlock: Map<number, SnapshotBlobEntry[]>;
}

interface BuildSnapshotBlobIndexParams {
	targetBlocks: Set<number>;
	blobToken: string;
	maxPages?: number;
}

/**
 * Build a block->blob index for snapshot files with bounded memory usage.
 * Only blobs for target blocks are retained.
 */
export async function buildSnapshotBlobIndex({
	targetBlocks,
	blobToken,
	maxPages = 1000
}: BuildSnapshotBlobIndexParams): Promise<SnapshotBlobIndex> {
	let totalBlobsInStorage = 0;
	const sampleBlobPaths: string[] = [];
	const seenBlockNumbers = new Set<number>();
	const blobsByBlock = new Map<number, SnapshotBlobEntry[]>();

	let cursor: string | undefined;
	let hasMore = true;
	let pages = 0;

	while (hasMore) {
		const page = await list({
			prefix: 'snapshots/',
			limit: 1000,
			cursor,
			token: blobToken
		});

		for (const blob of page.blobs) {
			totalBlobsInStorage++;
			if (sampleBlobPaths.length < 3) {
				sampleBlobPaths.push(blob.pathname);
			}

			const pathParts = blob.pathname.split('/');
			if (pathParts.length < 3) {
				continue;
			}

			const fileName = pathParts[pathParts.length - 1];
			const tokenSymbol = pathParts[pathParts.length - 2];
			if (!tokenSymbol) {
				continue;
			}

			const blockNumber = Number.parseInt(fileName.replace('.json', ''), 10);

			if (!Number.isNaN(blockNumber) && seenBlockNumbers.size < 1000) {
				seenBlockNumbers.add(blockNumber);
			}

			if (!targetBlocks.has(blockNumber)) continue;

			if (!blobsByBlock.has(blockNumber)) {
				blobsByBlock.set(blockNumber, []);
			}
			blobsByBlock.get(blockNumber)!.push({
				token: tokenSymbol,
				url: blob.url
			});
		}

		cursor = page.cursor;
		hasMore = page.hasMore;
		pages++;

		if (pages > maxPages) {
			throw new Error('Blob pagination exceeded safe limit while indexing snapshots');
		}
	}

	return {
		totalBlobsInStorage,
		sampleBlobPaths,
		allBlobBlockNumbers: Array.from(seenBlockNumbers).sort((a, b) => a - b),
		blobsByBlock
	};
}
