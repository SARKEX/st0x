import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockList } = vi.hoisted(() => ({
	mockList: vi.fn()
}));

vi.mock('@vercel/blob', () => ({
	list: mockList
}));

describe('buildSnapshotBlobIndex', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
	});

	it('paginates blob listing and only keeps target blocks', async () => {
		mockList
			.mockResolvedValueOnce({
				blobs: [
					{ pathname: 'snapshots/ETH/100.json', url: 'https://blob/100' },
					{ pathname: 'snapshots/BTC/200.json', url: 'https://blob/200' }
				],
				cursor: 'cursor-1',
				hasMore: true
			})
			.mockResolvedValueOnce({
				blobs: [
					{ pathname: 'snapshots/ETH/300.json', url: 'https://blob/300' },
					{ pathname: 'snapshots/ETH/not-a-number.json', url: 'https://blob/invalid' }
				],
				cursor: undefined,
				hasMore: false
			});

		const { buildSnapshotBlobIndex } = await import('./blobIndex');

		const result = await buildSnapshotBlobIndex({
			targetBlocks: new Set([200, 300]),
			blobToken: 'blob-token'
		});

		expect(result.totalBlobsInStorage).toBe(4);
		expect(result.sampleBlobPaths).toEqual([
			'snapshots/ETH/100.json',
			'snapshots/BTC/200.json',
			'snapshots/ETH/300.json'
		]);
		expect(result.allBlobBlockNumbers).toEqual(expect.arrayContaining([100, 200, 300]));
		expect(result.blobsByBlock.get(200)).toEqual([{ token: 'BTC', url: 'https://blob/200' }]);
		expect(result.blobsByBlock.get(300)).toEqual([{ token: 'ETH', url: 'https://blob/300' }]);
		expect(result.blobsByBlock.has(100)).toBe(false);

		expect(mockList).toHaveBeenCalledTimes(2);
		expect(mockList).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ prefix: 'snapshots/', limit: 1000, token: 'blob-token' })
		);
		expect(mockList).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ cursor: 'cursor-1', token: 'blob-token' })
		);
	});

	it('throws when blob pagination exceeds max pages', async () => {
		mockList.mockResolvedValue({
			blobs: [],
			cursor: 'still-more',
			hasMore: true
		});

		const { buildSnapshotBlobIndex } = await import('./blobIndex');

		await expect(
			buildSnapshotBlobIndex({
				targetBlocks: new Set([123]),
				blobToken: 'blob-token',
				maxPages: 1
			})
		).rejects.toThrow('Blob pagination exceeded safe limit while indexing snapshots');
	});
});
