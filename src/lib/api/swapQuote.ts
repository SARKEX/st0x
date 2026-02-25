/**
 * Swap quote API client for st0x.
 * POST /v1/swap/quote: inputToken = token you want, outputToken = token you offer, outputAmount = amount of output token (string).
 */

import { env } from '$env/dynamic/public';

const SWAP_QUOTE_URL = 'https://api.st0x.io/v1/swap/quote';

export interface SwapQuoteParams {
	/** Token address you want to receive */
	inputToken: string;
	/** Token address you are offering */
	outputToken: string;
	/** Amount of output token you are offering (in smallest units, as string) */
	outputAmount: string;
}

/** API response: human-readable number amounts. */
export interface SwapQuoteResponse {
	estimatedInput?: string;
	estimatedOutput?: string;
	estimatedIoRatio?: string;
}

function getAuthHeader(): string | null {
	const auth = env.PUBLIC_ST0X_SWAP_QUOTE_AUTH;
	return typeof auth === 'string' && auth ? auth : null;
}

/**
 * Fetches a swap quote: how much inputToken you get when offering outputAmount of outputToken.
 * Returns the estimated input amount as a human-readable string (e.g. "81.090169875"), or null on error.
 */
export async function fetchSwapQuote(params: SwapQuoteParams): Promise<string | null> {
	const auth = getAuthHeader();
	const headers: Record<string, string> = {
		accept: 'application/json',
		'Content-Type': 'application/json'
	};
	if (auth) {
		headers['Authorization'] = `Basic ${auth}`;
	}
	const res = await fetch(SWAP_QUOTE_URL, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			inputToken: params.inputToken,
			outputToken: params.outputToken,
			outputAmount: params.outputAmount
		})
	});
	if (!res.ok) return null;
	const data = (await res.json()) as SwapQuoteResponse;
	// estimatedInput = amount of inputToken you need/receive (human-readable)
	const raw = data.estimatedInput;
	return typeof raw === 'string' ? raw : null;
}
