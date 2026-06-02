import { describe, it, expect } from 'vitest';
import { bucketTimestamp } from './timeWindow';

describe('bucketTimestamp', () => {
	it('floors a timestamp down to the nearest bucket boundary', () => {
		// 12_345 / 300 = 41.15 → 41 * 300 = 12_300
		expect(bucketTimestamp(12_345, 300)).toBe(12_300);
	});

	it('returns identical values for two timestamps within the same bucket', () => {
		// Both land in the bucket starting at 1_000_500.
		expect(bucketTimestamp(1_000_500, 300)).toBe(bucketTimestamp(1_000_799, 300));
	});

	it('returns values exactly one bucket apart for adjacent buckets', () => {
		const a = bucketTimestamp(1_000_500, 300);
		const b = bucketTimestamp(1_000_800, 300);
		expect(b - a).toBe(300);
	});

	it('is a no-op when bucketSeconds is 1', () => {
		expect(bucketTimestamp(1_234_567, 1)).toBe(1_234_567);
	});

	it('leaves an already-aligned timestamp unchanged', () => {
		expect(bucketTimestamp(1_000_500, 300)).toBe(1_000_500);
	});
});
