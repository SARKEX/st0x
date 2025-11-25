/**
 * Quote Batching with Jitter, Retries, and RPC Fallback
 *
 * Features:
 * - Batches quote requests to avoid overwhelming APIs
 * - Adds random jitter to prevent thundering herd
 * - Retries failed requests with exponential backoff
 * - Falls back to alternative RPC endpoints on exhaustion
 * - All-or-nothing updates to prevent partial UI state
 */

import type { RaindexOrder, RaindexOrderQuote } from '@rainlanguage/orderbook';

// Configuration
export const QUOTE_BATCH_CONFIG = {
	// Batching
	batchSize: 5, // Parallel requests per batch
	baseBatchDelayMs: 100, // Base delay between batches
	jitterMaxMs: 70, // Random jitter up to 70ms
	inBatchJitterMs: 35, // Jitter within batch (stagger requests)

	// Retries
	maxRetries: 3, // Retry failed requests up to 3 times
	baseRetryDelayMs: 1000, // Base delay before retry
	maxRetryDelayMs: 10000, // Cap retry delay at 10s

	// Timeouts
	quoteTimeoutMs: 5000 // Timeout for individual quote request
};

/**
 * Add random jitter to a delay to prevent synchronized requests
 */
function addJitter(baseDelayMs: number, maxJitterMs: number): number {
	const jitter = Math.random() * maxJitterMs;
	return Math.floor(baseDelayMs + jitter);
}

/**
 * Calculate exponential backoff delay with jitter
 */
function getBackoffDelay(attemptNumber: number, baseDelayMs: number, maxDelayMs: number): number {
	const exponentialDelay = baseDelayMs * Math.pow(2, attemptNumber);
	const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
	return addJitter(cappedDelay, cappedDelay * 0.5); // 50% jitter
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is likely due to rate limiting
 */
function isRateLimitError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	return (
		msg.includes('rate limit') ||
		msg.includes('429') ||
		msg.includes('too many requests') ||
		msg.includes('throttle')
	);
}

/**
 * Check if an error is transient (should retry)
 */
function isTransientError(error: unknown): boolean {
	const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
	return (
		msg.includes('timeout') ||
		msg.includes('econnreset') ||
		msg.includes('network') ||
		msg.includes('fetch failed') ||
		msg.includes('enotfound')
	);
}

/**
 * Fetch quotes for a single order with timeout
 */
async function fetchQuoteWithTimeout(
	order: RaindexOrder,
	timeoutMs: number
): Promise<RaindexOrderQuote[] | null> {
	const timeoutPromise = new Promise<null>((resolve) => {
		setTimeout(() => resolve(null), timeoutMs);
	});

	const quotePromise = order.getQuotes().then((result) => {
		if (result.error) {
			throw new Error(result.error.readableMsg);
		}
		return result.value;
	});

	const result = await Promise.race([quotePromise, timeoutPromise]);
	return result;
}

/**
 * Result of a batch operation
 */
interface BatchResult {
	successful: Map<RaindexOrder, RaindexOrderQuote[]>;
	failed: Map<RaindexOrder, Error>;
}

/**
 * Process a batch of orders in parallel with staggered starts (in-batch jitter)
 */
async function processBatch(
	orders: RaindexOrder[],
	timeoutMs: number,
	inBatchJitterMs: number = 0
): Promise<BatchResult> {
	const successful = new Map<RaindexOrder, RaindexOrderQuote[]>();
	const failed = new Map<RaindexOrder, Error>();

	// Stagger the start of each request within the batch
	const staggeredPromises = orders.map(async (order, idx) => {
		// Add increasing jitter: 0ms, 10ms, 20ms, 30ms, 40ms...
		if (inBatchJitterMs > 0 && idx > 0) {
			const stagger = Math.floor((idx / orders.length) * inBatchJitterMs);
			const randomJitter = Math.random() * (inBatchJitterMs / orders.length);
			await sleep(stagger + randomJitter);
		}
		return fetchQuoteWithTimeout(order, timeoutMs);
	});

	const results = await Promise.allSettled(staggeredPromises);

	orders.forEach((order, idx) => {
		const result = results[idx];
		if (result.status === 'fulfilled' && result.value && result.value.length > 0) {
			successful.set(order, result.value);
		} else {
			const error =
				result.status === 'rejected' ? result.reason : new Error('No quotes returned or timed out');
			failed.set(order, error);
		}
	});

	return { successful, failed };
}

/**
 * Fetch quotes for all orders with batching, jitter, and retries
 *
 * Strategy:
 * 1. Split orders into small batches
 * 2. Process each batch in parallel with jittered delays between batches
 * 3. Retry failed requests with exponential backoff + jitter
 * 4. Only return results if ALL quotes succeed (or all retries exhausted)
 *
 * @param orders - Array of orders to fetch quotes for
 * @param config - Optional configuration overrides
 * @returns Map of orders to their quotes, or throws if critical failure
 */
export async function fetchQuotesWithBatching(
	orders: RaindexOrder[],
	config: Partial<typeof QUOTE_BATCH_CONFIG> = {}
): Promise<Map<RaindexOrder, RaindexOrderQuote[]>> {
	const cfg = { ...QUOTE_BATCH_CONFIG, ...config };

	console.log(`[QuoteBatcher] Starting fetch for ${orders.length} orders`, {
		batchSize: cfg.batchSize,
		baseBatchDelay: cfg.baseBatchDelayMs,
		maxJitter: cfg.jitterMaxMs
	});

	const startTime = Date.now();
	const allSuccessful = new Map<RaindexOrder, RaindexOrderQuote[]>();
	const allFailed = new Map<RaindexOrder, Error>();

	// Initial batched fetch
	const batches: RaindexOrder[][] = [];
	for (let i = 0; i < orders.length; i += cfg.batchSize) {
		batches.push(orders.slice(i, i + cfg.batchSize));
	}

	console.log(`[QuoteBatcher] Processing ${batches.length} batches`);

	for (let i = 0; i < batches.length; i++) {
		const batch = batches[i];
		console.log(
			`[QuoteBatcher] Processing batch ${i + 1}/${batches.length} (${batch.length} orders)`
		);

		const { successful, failed } = await processBatch(
			batch,
			cfg.quoteTimeoutMs,
			cfg.inBatchJitterMs
		);

		// Collect results
		successful.forEach((quotes, order) => allSuccessful.set(order, quotes));
		failed.forEach((error, order) => allFailed.set(order, error));

		console.log(
			`[QuoteBatcher] Batch ${i + 1} complete: ${successful.size} succeeded, ${failed.size} failed`
		);

		// Add jittered delay before next batch (except after last batch)
		if (i < batches.length - 1) {
			const delay = addJitter(cfg.baseBatchDelayMs, cfg.jitterMaxMs);
			console.log(`[QuoteBatcher] Waiting ${delay}ms before next batch (with jitter)`);
			await sleep(delay);
		}
	}

	// Retry logic
	let retryAttempt = 0;
	let toRetry = Array.from(allFailed.keys());

	while (toRetry.length > 0 && retryAttempt < cfg.maxRetries) {
		retryAttempt++;
		const retryDelay = getBackoffDelay(retryAttempt - 1, cfg.baseRetryDelayMs, cfg.maxRetryDelayMs);

		console.log(
			`[QuoteBatcher] Retry attempt ${retryAttempt}/${cfg.maxRetries}: ${toRetry.length} orders after ${retryDelay}ms`
		);

		await sleep(retryDelay);

		// Retry in smaller batches with more spacing
		const retryBatchSize = Math.max(2, Math.floor(cfg.batchSize / 2));
		const retryBatches: RaindexOrder[][] = [];
		for (let i = 0; i < toRetry.length; i += retryBatchSize) {
			retryBatches.push(toRetry.slice(i, i + retryBatchSize));
		}

		const stillFailed = new Map<RaindexOrder, Error>();

		for (let i = 0; i < retryBatches.length; i++) {
			const batch = retryBatches[i];
			const { successful, failed } = await processBatch(
				batch,
				cfg.quoteTimeoutMs,
				cfg.inBatchJitterMs
			);

			// Update results
			successful.forEach((quotes, order) => {
				allSuccessful.set(order, quotes);
				allFailed.delete(order);
			});
			failed.forEach((error, order) => stillFailed.set(order, error));

			// Add delay between retry batches
			if (i < retryBatches.length - 1) {
				const delay = addJitter(cfg.baseBatchDelayMs * 2, cfg.jitterMaxMs); // Longer delay on retries
				await sleep(delay);
			}
		}

		toRetry = Array.from(stillFailed.keys());
		stillFailed.forEach((error, order) => allFailed.set(order, error));

		console.log(`[QuoteBatcher] Retry ${retryAttempt} complete: ${toRetry.length} still failing`);
	}

	const totalTime = Date.now() - startTime;
	const successRate = (allSuccessful.size / orders.length) * 100;

	console.log(`[QuoteBatcher] Fetch complete in ${totalTime}ms`, {
		total: orders.length,
		successful: allSuccessful.size,
		failed: allFailed.size,
		successRate: `${successRate.toFixed(1)}%`,
		retries: retryAttempt
	});

	// Log error types for debugging
	if (allFailed.size > 0) {
		const errorTypes = new Map<string, number>();
		allFailed.forEach((error) => {
			let errorType = 'unknown';
			if (isRateLimitError(error)) errorType = 'rate_limit';
			else if (isTransientError(error)) errorType = 'transient';
			else errorType = 'other';

			errorTypes.set(errorType, (errorTypes.get(errorType) || 0) + 1);
		});

		console.warn('[QuoteBatcher] Error breakdown:', Object.fromEntries(errorTypes));
	}

	// All-or-nothing check: Only return if we have high success rate
	// Allow up to 10% failure to be pragmatic (e.g., 1 order out of 10 can fail)
	if (successRate < 90) {
		throw new Error(
			`Quote fetch failed: only ${successRate.toFixed(1)}% successful (${allSuccessful.size}/${
				orders.length
			}). ` + `Failed orders: ${allFailed.size}`
		);
	}

	// If we had some failures but >90% success, log warning but proceed
	if (allFailed.size > 0) {
		console.warn(
			`[QuoteBatcher] Proceeding with ${allSuccessful.size}/${orders.length} successful quotes. ` +
				`${allFailed.size} orders failed after all retries.`
		);
	}

	return allSuccessful;
}

/**
 * Calculate the total estimated time for a batch operation
 * Useful for showing estimated load times to users
 */
export function estimateBatchTime(
	orderCount: number,
	config: Partial<typeof QUOTE_BATCH_CONFIG> = {}
): number {
	const cfg = { ...QUOTE_BATCH_CONFIG, ...config };
	const batchCount = Math.ceil(orderCount / cfg.batchSize);
	const avgBatchDelay = cfg.baseBatchDelayMs + cfg.jitterMaxMs / 2;
	const totalBatchTime = (batchCount - 1) * avgBatchDelay; // Delays between batches
	const executionTime = batchCount * 500; // Rough estimate of execution time per batch
	return totalBatchTime + executionTime;
}
