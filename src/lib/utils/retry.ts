/**
 * Retry wrapper for RPC calls that fail with transient errors.
 * Handles "header not found" and "block not found" errors from load-balanced RPC providers.
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries = 3,
	delayMs = 1000
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			const errorMessage = String(error);
			// Retry on "header not found" or "block not found" RPC errors
			if (
				errorMessage.includes('header not found') ||
				errorMessage.includes('block not found') ||
				(error as { code?: number })?.code === -32000
			) {
				if (attempt < maxRetries - 1) {
					// Exponential backoff
					await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
					continue;
				}
			}
			throw error;
		}
	}
	throw lastError;
}
