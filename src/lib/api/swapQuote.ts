/**
 * Swap quote API client for st0x.
 * Uses server proxy POST /api/proxy-swap-quote (which calls api.st0x.io/v1/swap/quote).
 * inputToken = token you want, outputToken = token you offer, outputAmount = amount of output token (string).
 */

const PROXY_SWAP_QUOTE_URL = '/api/proxy-swap-quote';

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

/**
 * Fetches a swap quote via the server proxy (auth is applied server-side).
 * Use for market order estimation when orderbook has no quotes.
 */
export async function fetchSwapQuoteFull(
	params: SwapQuoteParams
): Promise<SwapQuoteResponse | null> {
	const res = await fetch(PROXY_SWAP_QUOTE_URL, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			inputToken: params.inputToken,
			outputToken: params.outputToken,
			outputAmount: params.outputAmount
		})
	});
	if (!res.ok) return null;
	return (await res.json()) as SwapQuoteResponse;
}

/**
 * Fetches a swap quote: how much inputToken you get when offering outputAmount of outputToken.
 * Returns the estimated input amount as a human-readable string (e.g. "81.090169875"), or null on error.
 */
export async function fetchSwapQuote(params: SwapQuoteParams): Promise<string | null> {
	const data = await fetchSwapQuoteFull(params);
	const raw = data?.estimatedInput;
	return typeof raw === 'string' ? raw : null;
}
