/**
 * Run async tasks over items with a maximum number in flight.
 * Prevents bursting the API when many tokens are fetched in parallel.
 */
export async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
	if (items.length === 0) return [];
	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex++;
			try {
				const value = await fn(items[index], index);
				results[index] = { status: 'fulfilled', value };
			} catch (reason) {
				results[index] = { status: 'rejected', reason };
			}
		}
	}

	await Promise.all(Array.from({ length: limit }, () => worker()));
	return results;
}
