import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '$lib/utils/retry';

describe('withRetry', () => {
	it('does not retry rate-limit errors owned by the RPC transport', async () => {
		const fn = vi.fn().mockRejectedValue({ code: -32016, message: 'over rate limit' });

		await expect(withRetry(fn, 3, 1)).rejects.toMatchObject({ code: -32016 });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('still retries transient block lookup errors', async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error('header not found'))
			.mockRejectedValueOnce({ code: -32000, message: 'block not found' })
			.mockResolvedValueOnce('ok');

		await expect(withRetry(fn, 3, 1)).resolves.toBe('ok');
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it('does not retry unrelated -32000 errors on write paths', async () => {
		const fn = vi.fn().mockRejectedValue({ code: -32000, message: 'transaction already known' });

		await expect(withRetry(fn, 3, 1)).rejects.toMatchObject({
			code: -32000,
			message: 'transaction already known'
		});
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('does not retry non-transient errors', async () => {
		const fn = vi.fn().mockRejectedValue(new Error('insufficient funds'));
		await expect(withRetry(fn, 3, 1)).rejects.toThrow('insufficient funds');
		expect(fn).toHaveBeenCalledTimes(1);
	});
});
