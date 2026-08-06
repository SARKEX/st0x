import { afterEach, describe, expect, it, vi } from 'vitest';
import { custom, type Transport } from 'viem';
import { base } from 'viem/chains';
import { createClientRpcFallback } from '$lib/config/clientRpc';
import { withRetry } from '$lib/utils/retry';

function rateLimitError(): Error & { code: number } {
	return Object.assign(new Error('over rate limit'), { code: -32016 });
}

function countingTransport(
	attempts: number[],
	index: number,
	request: (attempt: number) => Promise<unknown>
): Transport {
	return custom({
		async request() {
			attempts[index] += 1;
			return request(attempts[index]);
		}
	});
}

function buildRequest(transports: Transport[]): (method: string) => Promise<unknown> {
	const transport = createClientRpcFallback(transports)({
		chain: base,
		retryCount: 0
	});
	return (method) => transport.request({ method });
}

afterEach(() => {
	vi.useRealTimers();
});

describe('client RPC retry policy', () => {
	it('bounds a wrapped rate-limited read to two attempts per provider', async () => {
		vi.useFakeTimers();
		const attempts = Array.from({ length: 6 }, () => 0);
		const request = buildRequest(
			attempts.map((_, index) =>
				countingTransport(attempts, index, async () => {
					throw rateLimitError();
				})
			)
		);

		const result = withRetry(() => request('eth_blockNumber'), 3, 1);
		const assertion = expect(result).rejects.toThrow('over rate limit');
		await vi.advanceTimersByTimeAsync(999);
		expect(attempts).toEqual([1, 1, 1, 1, 1, 1]);
		await vi.advanceTimersByTimeAsync(1);
		await assertion;

		expect(attempts).toEqual([2, 2, 2, 2, 2, 2]);
		expect(attempts.reduce((sum, count) => sum + count, 0)).toBe(12);
	});

	it('recovers when a fallback becomes healthy on the retry round', async () => {
		vi.useFakeTimers();
		const attempts = [0, 0];
		const request = buildRequest([
			countingTransport(attempts, 0, async () => {
				throw rateLimitError();
			}),
			countingTransport(attempts, 1, async (attempt) => {
				if (attempt === 1) throw rateLimitError();
				return '0x123';
			})
		]);

		const result = request('eth_blockNumber');
		await vi.advanceTimersByTimeAsync(999);
		expect(attempts).toEqual([1, 1]);
		await vi.advanceTimersByTimeAsync(1);

		await expect(result).resolves.toBe('0x123');
		expect(attempts).toEqual([2, 2]);
	});
});
