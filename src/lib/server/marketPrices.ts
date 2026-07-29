import { env } from '$env/dynamic/private';
import type { ApiMarketPrice, ApiMarketPricesResponse } from '$lib/api/st0xApi';
import { parseRetryAfterMs } from '$lib/clients/http';
import { getSt0xPricesApiConfig } from '$lib/server/st0xApiConfig';
import { logSt0xRequestBudget } from '$lib/server/st0xBudgetTelemetry';
import type { MidpointPrice } from '$lib/utils/midpointPrice';

export class St0xMarketPricesRateLimitError extends Error {
	readonly retryAfterMs: number | null;

	constructor(retryAfterMs: number | null = null) {
		super('ST0x market prices API rate limit reached');
		this.name = 'St0xMarketPricesRateLimitError';
		this.retryAfterMs = retryAfterMs;
	}
}

/**
 * Fetch retained market prices directly from the REST API. This server-only
 * helper is shared by public display pricing and the snapshot cron so API
 * credentials never reach the browser.
 */
export async function fetchMarketPrices(
	chainId: number,
	options?: { at?: number; timeoutMs?: number; maxAttempts?: number }
): Promise<ApiMarketPrice[]> {
	const config = getSt0xPricesApiConfig(env);
	if (!config) {
		throw new Error('ST0x public-price API credentials are not configured');
	}
	const { apiBase, authHeader, credentialLabel } = config;
	const params = new URLSearchParams({ chainId: String(chainId) });
	if (options?.at !== undefined) params.set('at', String(options.at));

	const maxAttempts = Math.max(1, options?.maxAttempts ?? 3);
	let lastError: Error | null = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(`${apiBase}/v1/prices?${params}`, {
				headers: { Authorization: authHeader, Accept: 'application/json' },
				signal: AbortSignal.timeout(options?.timeoutMs ?? 10_000)
			});
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));
			if (attempt < maxAttempts) {
				await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
			}
			continue;
		}
		logSt0xRequestBudget('v1/prices', credentialLabel, response);
		if (response.ok) {
			const body = (await response.json()) as ApiMarketPricesResponse;
			return body.data;
		}
		if (response.status === 429) {
			throw new St0xMarketPricesRateLimitError(
				parseRetryAfterMs(response.headers.get('Retry-After'))
			);
		}
		const error = new Error(`Market prices fetch failed (${response.status})`);
		if (response.status < 500) {
			throw error;
		}
		lastError = error;
		if (attempt < maxAttempts) {
			await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
		}
	}
	throw lastError ?? new Error('Market prices fetch failed');
}

/** Adapt exact decimal API strings to the website's existing numeric display model. */
export function toWebsiteMarketPrices(rows: ApiMarketPrice[]): Record<string, MidpointPrice> {
	return Object.fromEntries(
		rows.map((row) => [
			row.assetAddress.toLowerCase(),
			{
				price: row.midpoint === null ? null : Number(row.midpoint),
				bid: row.bestBid === null ? null : Number(row.bestBid),
				ask: row.bestAsk === null ? null : Number(row.bestAsk),
				source: row.source,
				asOf: row.observedAt === null ? null : row.observedAt * 1000,
				change24hPercent: row.change24hPercent === null ? null : Number(row.change24hPercent)
			}
		])
	);
}
