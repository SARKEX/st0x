/**
 * Retry wrapper for RPC calls that fail with transient errors.
 * Handles load-balanced "header/block not found" flake.
 *
 * Rate-limit retries are intentionally owned by the wagmi fallback transport.
 * Retrying them here as well would replay the entire provider fallback chain.
 */
function isTransientRpcError(error: unknown): boolean {
	const errorMessage = String(
		(error as { message?: unknown } | null)?.message ?? error ?? ''
	).toLowerCase();
	return errorMessage.includes('header not found') || errorMessage.includes('block not found');
}

export async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries = 3,
	delayMs = 1000
): Promise<T> {
	if (maxRetries < 1) {
		throw new Error('maxRetries must be at least 1');
	}

	let lastError: unknown;
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			if (isTransientRpcError(error) && attempt < maxRetries - 1) {
				await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
				continue;
			}
			throw error;
		}
	}
	// Unreachable: loop always exits via return or throw above.
	// Retained to satisfy TypeScript control-flow analysis.
	throw lastError;
}
